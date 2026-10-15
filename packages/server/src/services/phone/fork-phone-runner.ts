// Fork feature: Pocket Phone, part 2 — running the phone agent and calls with a model (see FORK.md).
import { readForkPhoneSettings } from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import { createCharactersStorage } from "../storage/characters.storage.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { createGameStateStorage } from "../storage/game-state.storage.js";
import { resolveChatUserIdentity } from "../chat-user-identity.js";
import { resolveChatSummaryConnection } from "../chat-summary/connection-resolution.js";
import { resolveBaseUrl } from "../generation/connection-base-url.js";
import { listBondsBeforeTurn, listPairsBeforeTurn } from "../bonds/fork-bond-updates.js";
import { bondsPromptBlock } from "../generation/fork-bonds-prompt.js";
import { pairsPromptBlock } from "../bonds/fork-bond-pairs.js";
import { plainMessageText } from "../chapters/fork-chapter-recap.js";
import { logDebugOverride, logger } from "../../lib/logger.js";
import { newId } from "../../utils/id-generator.js";
import { createPhoneStorage, PHONE_CONTACT, PHONE_PERSONA, type PhoneMessage } from "./fork-phone.js";
import { contactLine, contactWho, phonePromptBlock, phoneSideName } from "./fork-phone-prompt.js";
import { buildPhoneWriteMessages, readWrittenPhone, readWrittenPhones } from "./fork-phone-peek.js";
import {
  applyTextSwipe,
  buildTextSwipeMessages,
  canSwipePhoneText,
  MAX_TEXT_SWIPES,
  readTextSwipe,
} from "./fork-phone-texts.js";
import {
  buildCallLineMessages,
  buildContactReplyMessages,
  buildPhoneAgentMessages,
  cleanSpokenLine,
  dueQueueItems,
  owedReplies,
  phoneRunMetadata,
  phoneSideResolver,
  planIdleDelivery,
  planPhoneRun,
  readContactReply,
  readPhoneAgentAnswer,
  readPhoneRunState,
  rewindPhoneRun,
  shouldSkipPhoneRun,
  type PhoneRunPlan,
  type PhoneRunState,
} from "./fork-phone-agent.js";

type ChatRow = NonNullable<Awaited<ReturnType<ReturnType<typeof createChatsStorage>["getById"]>>>;

export class PhoneError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const STORY_MESSAGES = 8;
const STORY_MESSAGE_CHARS = 1200;
const OTHER_THREAD_LINES = 4;
const CALL_LINES_MAX = 60;
/** Texts of a contact conversation the contact's answer is written from. */
const CONTACT_TEXTS = 12;

/** One phone run per chat at a time; a second reply's run waits its turn. */
const chatLocks = new Map<string, Promise<unknown>>();
function withLock<T>(chatId: string, work: () => Promise<T>): Promise<T> {
  const previous = chatLocks.get(chatId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  chatLocks.set(chatId, next);
  // Both ways, so a failed step never leaves a rejected promise nobody handles (that ends the process).
  const release = () => {
    if (chatLocks.get(chatId) === next) chatLocks.delete(chatId);
  };
  next.then(release, release);
  return next;
}

export function createPhoneRunner(db: DB) {
  const chats = createChatsStorage(db);
  const characters = createCharactersStorage(db);
  const phones = createPhoneStorage(db);

  async function getChat(chatId: string): Promise<ChatRow> {
    const chat = await chats.getById(chatId);
    if (!chat) throw new PhoneError("Chat not found", 404);
    return chat;
  }

  async function cast(chat: ChatRow) {
    const members: { id: string; name: string; about: string }[] = [];
    for (const id of parseList(chat.characterIds).filter((item): item is string => typeof item === "string")) {
      const data = parseRecord((await characters.getById(id))?.data);
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name) continue;
      const about = typeof data.description === "string" ? plainMessageText(data.description).slice(0, 300) : "";
      members.push({ id, name, about });
    }
    const identity = await resolveChatUserIdentity(characters, chat).catch(() => null);
    const personaName = identity?.name?.trim() || "User";
    const nameFor = (id: string) => members.find((member) => member.id === id)?.name ?? "";
    const contacts = readForkPhoneSettings(parseRecord(chat.metadata)).contacts;
    return {
      members,
      personaName,
      nameFor,
      contacts,
      contactOf: (side: string) => contacts.find((contact) => `${PHONE_CONTACT}${contact.name}` === side),
      side: (side: string) => phoneSideName(side, personaName, nameFor),
    };
  }

  async function provider(chat: ChatRow) {
    const resolved = await resolveChatSummaryConnection({
      chatConnectionId: chat.connectionId && chat.connectionId !== "random" ? chat.connectionId : null,
      defaultConnectionId: (await createConnectionsStorage(db).getDefault())?.id ?? null,
      chatMetadata: parseRecord(chat.metadata),
      connections: createConnectionsStorage(db),
      resolveBaseUrl,
    });
    if (!resolved.ok) throw new PhoneError(resolved.error, 400);
    return resolved;
  }

  /** Streamed (LinkAPI drops long plain requests), with one plain retry when the stream fails. */
  async function complete(
    chat: ChatRow,
    messages: { role: "user"; content: string }[],
    label: string,
    debug: boolean,
    maxTokens: number,
  ): Promise<string> {
    const resolved = await provider(chat);
    logDebugOverride(
      debug,
      "[debug/fork-phone] %s prompt for chat %s:\n%s",
      label,
      chat.id,
      messages.map((entry) => `[${entry.role}]\n${entry.content}`).join("\n\n"),
    );
    const ask = (stream: boolean) =>
      resolved.provider.chatComplete(messages, { model: resolved.model, temperature: 0.8, maxTokens, stream });
    const result = await ask(true).then(
      (answer) => (answer.finishReason === "error" ? ask(false) : answer),
      () => ask(false),
    );
    logDebugOverride(
      debug,
      "[debug/fork-phone] %s answer for chat %s (finish: %s):\n%s",
      label,
      chat.id,
      result.finishReason ?? "",
      result.content ?? "",
    );
    return result.content ?? "";
  }

  async function storyTranscript(
    chat: ChatRow,
    nameOf: (message: { role: string; characterId?: string | null }) => string,
  ) {
    const recent = (await chats.listMessagePreviews(chat.id, STORY_MESSAGES)) as {
      id: string;
      role: string;
      characterId?: string | null;
      content: string;
    }[];
    const text = recent
      .map((message) => {
        const body = plainMessageText(String(message.content ?? ""));
        return body ? `${nameOf(message)}: ${body.slice(-STORY_MESSAGE_CHARS)}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    return { text, latestId: recent[recent.length - 1]?.id ?? "" };
  }

  async function scene(chatId: string) {
    const latest = (await createGameStateStorage(db).getLatest(chatId)) as Record<string, unknown> | null;
    const present = parseList(latest?.presentCharacters)
      .map((entry) => parseRecord(entry).characterId)
      .filter((id): id is string => typeof id === "string" && Boolean(id));
    const field = (key: string) => (typeof latest?.[key] === "string" ? (latest[key] as string) : "");
    return { date: field("date"), time: field("time"), location: field("location"), present };
  }

  async function saveState(chatId: string, state: PhoneRunState) {
    await chats.patchMetadata(chatId, () => phoneRunMetadata(state));
  }

  /** Puts a plan's texts, calls, thread lines and drafts on the phones. */
  async function applyPlan(chatId: string, plan: PhoneRunPlan, replyId: string, storyTime: string) {
    const added: PhoneMessage[] = [];
    for (const item of plan.deliver) {
      const thread = await phones.ensureThread(chatId, PHONE_PERSONA, item.from);
      const message = await phones.addMessage({
        chatId,
        threadId: thread.id,
        sender: item.from,
        body: item.kind === "call" ? "" : item.body,
        kind: item.kind,
        storyTime,
        afterMessageId: replyId,
        source: "agent",
      });
      if (!message) continue;
      added.push(message);
      if (item.kind === "call") {
        plan.state.call = {
          id: message.id,
          from: item.from,
          about: item.body,
          opening: item.opening,
          state: "ringing",
          reply: replyId,
        };
      }
    }
    for (const line of [
      ...plan.threads.map((entry) => ({ ...entry, kind: "text" as const })),
      ...plan.drafts.map((entry) => ({ ...entry, kind: "draft" as const })),
    ]) {
      const thread = await phones.ensureThread(chatId, line.from, line.to);
      const message = await phones.addMessage({
        chatId,
        threadId: thread.id,
        sender: line.from,
        body: line.body,
        kind: line.kind,
        storyTime,
        afterMessageId: replyId,
        source: "agent",
        // The persona's phone never shows these, so they never count as unread there.
        read: true,
      });
      if (message) added.push(message);
    }
    return added;
  }

  /** Writes a character's phone once, from the story so far, and saves it. */
  async function writePhone(
    chat: ChatRow,
    owner: { id: string; name: string; about: string },
    people: Awaited<ReturnType<typeof cast>>,
    debug: boolean,
  ) {
    const threads = await phones.listThreads(chat.id);
    const messages = await phones.listMessages(chat.id);
    const existing = threads
      .filter((thread) => thread.a === owner.id || thread.b === owner.id)
      .map((thread) => {
        const other = thread.a === owner.id ? thread.b : thread.a;
        const lines = messages
          .filter((message) => message.threadId === thread.id && message.kind !== "call_line")
          .slice(-OTHER_THREAD_LINES)
          .map((message) => `- ${people.side(message.sender)}: ${message.body}`);
        return lines.length ? `With ${people.side(other)}:\n${lines.join("\n")}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const { text: story } = await storyTranscript(chat, (message) =>
      message.role === "user"
        ? people.personaName
        : message.role === "narrator"
          ? "Narrator"
          : people.nameFor(message.characterId ?? "") || "Character",
    );
    const raw = await complete(
      chat,
      buildPhoneWriteMessages({
        ownerName: owner.name,
        ownerAbout: owner.about,
        personaName: people.personaName,
        others: people.members.filter((member) => member.id !== owner.id).map((member) => member.name),
        people: [
          bondsPromptBlock(await listBondsBeforeTurn(db, chat.id), people.nameFor, people.personaName),
          pairsPromptBlock(await listPairsBeforeTurn(db, chat.id), people.nameFor),
        ]
          .filter(Boolean)
          .join("\n"),
        story,
        existing,
      }),
      "phone write",
      debug,
      // A whole phone is long, and thinking models spend part of the budget before writing it.
      8000,
    );
    const written = readWrittenPhone(raw, owner.id, phoneSideResolver(people.personaName, people.members));
    if (!written) throw new PhoneError("The phone would not unlock. Try again.", 502);
    // Written ahead as part of their life so far: tied to no reply, so a swipe never rewrites it.
    const add = async (input: {
      with: string;
      sender: string;
      body: string;
      kind: PhoneMessage["kind"];
      time?: string;
    }) => {
      const thread = await phones.ensureThread(chat.id, owner.id, input.with);
      await phones.addMessage({
        chatId: chat.id,
        threadId: thread.id,
        sender: input.sender,
        body: input.body,
        kind: input.kind,
        storyTime: input.time ?? "",
        source: "agent",
        read: true,
      });
    };
    for (const thread of written.threads) {
      for (const text of thread.texts) {
        await add({
          with: thread.with,
          sender: text.mine ? owner.id : thread.with,
          body: text.body,
          kind: text.photo ? "photo" : "text",
          time: text.time,
        });
      }
    }
    for (const draft of written.drafts)
      await add({ with: draft.to, sender: owner.id, body: draft.body, kind: "draft" });
    for (const call of written.calls) {
      await add({
        with: call.with,
        sender: call.outgoing ? owner.id : call.with,
        body: call.missed ? `(missed) ${call.about || "a call"}` : call.about || "a call",
        kind: "call",
        time: call.time,
      });
    }
    await chats.patchMetadata(chat.id, (meta) => {
      const phone = parseRecord(meta.forkPhone);
      const looks = parseRecord(phone.characterLooks);
      return {
        forkPhoneWritten: { ...parseRecord(meta.forkPhoneWritten), [owner.id]: { photos: written.photos } },
        // The AI picks a phone that suits them, unless you already chose one.
        ...(written.look && !looks[owner.id]
          ? { forkPhone: { ...phone, characterLooks: { ...looks, [owner.id]: written.look } } }
          : {}),
      };
    });
  }

  return {
    /**
     * After a story reply: takes back an earlier run for the same reply (a swipe), then asks the
     * agent who texts or calls, and delivers within the caps. Returns what arrived on the phones.
     */
    async afterReply(chatId: string, replyId: string, debug: boolean) {
      return withLock(chatId, async () => {
        let chat = await getChat(chatId);
        const meta = parseRecord(chat.metadata);
        if (!readForkPhoneSettings(meta).on) return { ran: false, added: [] as PhoneMessage[] };
        await phones.forgetAgentMessages(chatId, [replyId]);
        let state = rewindPhoneRun(readPhoneRunState(meta), [replyId]);
        // A reply that was deleted since takes its queued texts with it.
        for (const item of [...state.queue]) {
          if (item.fromReply && !(await chats.getMessage(item.fromReply)))
            state = rewindPhoneRun(state, [item.fromReply]);
        }
        const people = await cast(chat);
        const where = await scene(chatId);
        const threads = await phones.listThreads(chatId);
        const messages = await phones.listMessages(chatId);
        // A character who left the chat owes nothing; their thread stays readable on your phone.
        const castIds = new Set(people.members.map((member) => member.id));
        const owed = new Set([...owedReplies(threads, messages)].filter((id) => castIds.has(id)));
        if (
          shouldSkipPhoneRun({
            castIds: people.members.map((member) => member.id),
            presentIds: where.present,
            state,
            owed,
          })
        ) {
          await saveState(chatId, { ...state, runs: [...state.runs, replyId] });
          return { ran: false, added: [] as PhoneMessage[] };
        }
        const { text: story } = await storyTranscript(chat, (message) =>
          message.role === "user"
            ? people.personaName
            : message.role === "narrator"
              ? "Narrator"
              : people.nameFor(message.characterId ?? "") || "Character",
        );
        const others = threads
          .filter((thread) => thread.a !== PHONE_PERSONA && thread.b !== PHONE_PERSONA)
          .map((thread) => {
            const lines = messages
              .filter((message) => message.threadId === thread.id && message.kind === "text")
              .slice(-OTHER_THREAD_LINES)
              .map((message) => `- ${people.side(message.sender)}: ${message.body}`);
            return lines.length
              ? `Texts between ${people.side(thread.a)} and ${people.side(thread.b)} (private):\n${lines.join("\n")}`
              : "";
          })
          .filter(Boolean);
        const due = new Set(dueQueueItems({ ...state, runs: [...state.runs, replyId] }).map((item) => item.id));
        const call = state.call
          ? `${people.side(state.call.from)} is ${state.call.state === "ringing" ? `calling ${people.personaName} right now (ringing)` : `on a call with ${people.personaName}`}.`
          : "";
        const prompt = buildPhoneAgentMessages({
          contacts: people.contacts.map(contactLine),
          personaName: people.personaName,
          // No one listed as present means the world state is not tracking it, not that everyone left.
          cast: people.members.map((member) => ({
            ...member,
            present: where.present.length ? where.present.includes(member.id) : null,
          })),
          date: where.date,
          time: where.time,
          location: where.location,
          people: [
            bondsPromptBlock(await listBondsBeforeTurn(db, chatId), people.nameFor, people.personaName),
            pairsPromptBlock(await listPairsBeforeTurn(db, chatId), people.nameFor),
          ]
            .filter(Boolean)
            .join("\n"),
          story,
          phones: [phonePromptBlock(threads, messages, people.personaName, people.nameFor), ...others]
            .filter(Boolean)
            .join("\n\n"),
          owed: [...owed].map(people.side),
          queue: state.queue
            .filter((item) => !item.deliveredAt)
            .map((item) => ({
              id: item.id,
              who: people.side(item.from),
              kind: item.kind,
              body: item.body,
              status: due.has(item.id) ? "arrives now unless dropped" : "waiting",
            })),
          call,
        });
        const raw = await complete(chat, prompt, "agent", debug, 1500);
        const answer = readPhoneAgentAnswer(
          raw,
          phoneSideResolver(
            people.personaName,
            people.members,
            people.contacts.map((contact) => contact.name),
          ),
          new Set(people.contacts.map((contact) => `${PHONE_CONTACT}${contact.name}`)),
        );
        const plan = planPhoneRun({ state, answer, replyId, day: where.date, owed, newId });
        plan.state.reachable = answer.reachable.length ? { reply: replyId, ids: answer.reachable } : null;
        // The phone may have been switched off while the agent was thinking.
        chat = await getChat(chatId);
        if (!readForkPhoneSettings(parseRecord(chat.metadata)).on) return { ran: true, added: [] as PhoneMessage[] };
        const added = await applyPlan(chatId, plan, replyId, where.time);
        await saveState(chatId, plan.state);
        return { ran: true, added };
      });
    },

    /** You sat in the chat a while: whatever is waiting arrives, after the newest story message. */
    async deliverIdle(chatId: string) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const meta = parseRecord(chat.metadata);
        if (!readForkPhoneSettings(meta).on) return { added: [] as PhoneMessage[] };
        const state = readPhoneRunState(meta);
        if (!state.queue.some((item) => !item.deliveredAt)) return { added: [] as PhoneMessage[] };
        const [latest] = (await chats.listMessagePreviews(chatId, 1)) as { id: string }[];
        if (!latest) return { added: [] as PhoneMessage[] };
        const where = await scene(chatId);
        const plan = planIdleDelivery(state, latest.id, where.date);
        const added = await applyPlan(chatId, plan, latest.id, where.time);
        await saveState(chatId, plan.state);
        return { added };
      });
    },

    /** Picks up the ringing call: its opening line is said. */
    async answer(chatId: string) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const state = readPhoneRunState(parseRecord(chat.metadata));
        if (!state.call || state.call.state !== "ringing") throw new PhoneError("Nobody is calling", 400);
        const card = await phones.getMessage(state.call.id);
        if (!card) {
          await saveState(chatId, { ...state, call: null });
          throw new PhoneError("The call is gone", 404);
        }
        if (state.call.opening) {
          await phones.addMessage({
            chatId,
            threadId: card.threadId,
            sender: state.call.from,
            body: state.call.opening,
            kind: "call_line",
            storyTime: card.storyTime,
            afterMessageId: card.afterMessageId,
            source: "agent",
            callId: card.id,
            read: true,
          });
        }
        await saveState(chatId, { ...state, call: { ...state.call, state: "live" } });
        return { callId: card.id };
      });
    },

    /** Lets it ring out: the card says it was missed, and the next run may turn it into a text. */
    async decline(chatId: string) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const state = readPhoneRunState(parseRecord(chat.metadata));
        if (!state.call) return { success: true };
        if (await phones.getMessage(state.call.id)) {
          await phones.editMessage(state.call.id, `(missed) ${state.call.about || "a call"}`);
        }
        await saveState(chatId, { ...state, call: null });
        return { success: true };
      });
    },

    /**
     * You call a card character; they pick up.
     * ponytail: they always answer. Letting the story decide (busy, ignoring you) needs a model
     * call before the first line; add it here if always-answering feels wrong in play.
     */
    async callOut(chatId: string, to: string) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const meta = parseRecord(chat.metadata);
        if (!readForkPhoneSettings(meta).on) throw new PhoneError("The phone is off for this chat", 400);
        const state = readPhoneRunState(meta);
        if (state.call) throw new PhoneError("You are already on a call", 400);
        const people = await cast(chat);
        if (!people.members.some((member) => member.id === to) && !people.contactOf(to)) {
          throw new PhoneError("Who are you calling?", 400);
        }
        const [latest] = (await chats.listMessagePreviews(chatId, 1)) as { id: string }[];
        const where = await scene(chatId);
        const thread = await phones.ensureThread(chatId, PHONE_PERSONA, to);
        const card = await phones.addMessage({
          chatId,
          threadId: thread.id,
          sender: PHONE_PERSONA,
          body: "",
          kind: "call",
          storyTime: where.time,
          afterMessageId: latest?.id ?? "",
          source: "user",
        });
        if (!card) throw new PhoneError("The phone is full", 400);
        await saveState(chatId, {
          ...state,
          call: { id: card.id, from: to, about: "", opening: "", state: "live", reply: "" },
        });
        return { callId: card.id };
      });
    },

    /** Your line on the call, and theirs back. */
    async say(chatId: string, line: string, debug: boolean) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const state = readPhoneRunState(parseRecord(chat.metadata));
        if (!state.call || state.call.state !== "live") throw new PhoneError("No call is on the line", 400);
        const card = await phones.getMessage(state.call.id);
        if (!card) throw new PhoneError("The call is gone", 404);
        const callLines = (await phones.listMessages(chatId)).filter((message) => message.callId === card.id);
        if (callLines.length >= CALL_LINES_MAX) throw new PhoneError("This call is long enough; hang up", 400);
        const mine = await phones.addMessage({
          chatId,
          threadId: card.threadId,
          sender: PHONE_PERSONA,
          body: line,
          kind: "call_line",
          storyTime: card.storyTime,
          afterMessageId: card.afterMessageId,
          source: "user",
          callId: card.id,
        });
        if (!mine) throw new PhoneError("Say something first", 400);
        const people = await cast(chat);
        const characterName = people.side(state.call.from);
        const { text: story } = await storyTranscript(chat, (message) =>
          message.role === "user"
            ? people.personaName
            : message.role === "narrator"
              ? "Narrator"
              : people.nameFor(message.characterId ?? "") || "Character",
        );
        const raw = await complete(
          chat,
          buildCallLineMessages({
            characterName,
            who: (() => {
              const contact = people.contactOf(state.call.from);
              return contact ? contactWho(contact, people.personaName) : undefined;
            })(),
            about: state.call.about,
            personaName: people.personaName,
            story,
            lines: [...callLines, mine].map((entry) => ({ name: people.side(entry.sender), text: entry.body })),
          }),
          "call line",
          debug,
          600,
        );
        const spoken = cleanSpokenLine(raw, characterName);
        const theirs = spoken
          ? await phones.addMessage({
              chatId,
              threadId: card.threadId,
              sender: state.call.from,
              body: spoken,
              kind: "call_line",
              storyTime: card.storyTime,
              afterMessageId: card.afterMessageId,
              source: "agent",
              callId: card.id,
              read: true,
            })
          : null;
        return { mine, theirs };
      });
    },

    /** Hangs up: the card keeps what the call was about, and its lines stay as the transcript. */
    async hangUp(chatId: string) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const state = readPhoneRunState(parseRecord(chat.metadata));
        if (!state.call) return { success: true };
        const call = state.call;
        const said = (await phones.listMessages(chatId)).some((message) => message.callId === call.id);
        // Hung up before a word was said: there was no call to remember.
        if (!said) await phones.removeMessage(call.id);
        else if (call.about && (await phones.getMessage(call.id))) await phones.editMessage(call.id, call.about);
        await saveState(chatId, { ...state, call: null });
        return { success: true };
      });
    },

    /**
     * Looks at a character's phone while the latest reply left it within reach. The first look
     * writes the phone (one model call) and saves it; every look is remembered for the writer.
     */
    async peek(chatId: string, characterId: string, debug: boolean) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const meta = parseRecord(chat.metadata);
        if (!readForkPhoneSettings(meta).on) throw new PhoneError("The phone is off for this chat", 400);
        const reach = readPhoneRunState(meta).reachable;
        const [latest] = (await chats.listMessagePreviews(chatId, 1)) as { id: string }[];
        if (!reach || !reach.ids.includes(characterId) || reach.reply !== latest?.id) {
          throw new PhoneError("That phone is not within reach right now", 400);
        }
        const people = await cast(chat);
        const owner = people.members.find((member) => member.id === characterId);
        if (!owner) throw new PhoneError("That character is not in this chat", 404);
        if (!readWrittenPhones(meta)[characterId]) await writePhone(chat, owner, people, debug);
        const state = readPhoneRunState(parseRecord((await getChat(chatId)).metadata));
        if (!state.peeks.some((peek) => peek.characterId === characterId && peek.reply === reach.reply)) {
          state.peeks.push({
            characterId,
            reply: reach.reply,
            storyTime: (await scene(chatId)).time,
            threadIds: [],
            at: new Date().toISOString(),
          });
        } else {
          for (const peek of state.peeks) if (peek.characterId === characterId) peek.at = new Date().toISOString();
        }
        await saveState(chatId, state);
        return { success: true };
      });
    },

    /** You opened one of their conversations while peeking: the writer is told its lines. */
    async peekSeen(chatId: string, characterId: string, threadId: string) {
      return withLock(chatId, async () => {
        const state = readPhoneRunState(parseRecord((await getChat(chatId)).metadata));
        const peek = [...state.peeks].reverse().find((entry) => entry.characterId === characterId);
        const thread = await phones.getThread(threadId);
        if (!peek || !thread || (thread.a !== characterId && thread.b !== characterId)) return { success: false };
        if (!peek.threadIds.includes(threadId)) peek.threadIds.push(threadId);
        peek.at = new Date().toISOString();
        await saveState(chatId, state);
        return { success: true };
      });
    },

    /**
     * A contact answers your texts: one to three texts in their voice. They were not in the
     * scenes, so they are told only your conversation, with the story for tone.
     */
    async contactReply(chatId: string, name: string, debug: boolean) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const meta = parseRecord(chat.metadata);
        if (!readForkPhoneSettings(meta).on) throw new PhoneError("The phone is off for this chat", 400);
        const people = await cast(chat);
        const side = `${PHONE_CONTACT}${name}`;
        const contact = people.contactOf(side);
        if (!contact) throw new PhoneError("That contact is not in your phone", 404);
        const thread = await phones.ensureThread(chatId, PHONE_PERSONA, side);
        const texts = (await phones.listMessages(chatId)).filter(
          (message) => message.threadId === thread.id && (message.kind === "text" || message.kind === "photo"),
        );
        const last = texts[texts.length - 1];
        // Only when your text is the newest: they have nothing to answer otherwise.
        if (!last || last.sender !== PHONE_PERSONA) return { added: [] as PhoneMessage[] };
        const { text: story } = await storyTranscript(chat, (message) =>
          message.role === "user"
            ? people.personaName
            : message.role === "narrator"
              ? "Narrator"
              : people.nameFor(message.characterId ?? "") || "Character",
        );
        const where = await scene(chatId);
        const raw = await complete(
          chat,
          buildContactReplyMessages({
            name: contact.name,
            who: contactWho(contact, people.personaName),
            personaName: people.personaName,
            storyTime: where.time,
            story,
            texts: texts
              .slice(-CONTACT_TEXTS)
              .map((text) => ({ name: people.side(text.sender), text: text.body, time: text.storyTime })),
          }),
          "contact reply",
          debug,
          800,
        );
        const added: PhoneMessage[] = [];
        for (const body of readContactReply(raw)) {
          const message = await phones.addMessage({
            chatId,
            threadId: thread.id,
            sender: side,
            body,
            storyTime: where.time,
            // Shown in the chat with your text, after the same story message.
            // ponytail: a swipe of that story message takes the answer back, like any AI text after
            // it, while your text stays; the next text you send gets a fresh answer.
            afterMessageId: last.afterMessageId,
            source: "agent",
          });
          if (message) added.push(message);
        }
        return { added };
      });
    },

    /**
     * Another version of a character's (or contact's) newest text, or back to an earlier one.
     * Only the newest text in its conversation: older texts were already answered.
     */
    async swipeText(chatId: string, messageId: string, change: { to: number } | { fresh: true }, debug: boolean) {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const message = await phones.getMessage(messageId);
        if (!message || message.chatId !== chatId) throw new PhoneError("Text not found", 404);
        const thread = (await phones.listMessages(chatId)).filter((entry) => entry.threadId === message.threadId);
        if (!canSwipePhoneText(message, thread)) {
          throw new PhoneError("Only their newest text can be swiped", 400);
        }
        if ("to" in change) return phones.setVersions(message.id, applyTextSwipe(message, change));
        if (message.swipes.length >= MAX_TEXT_SWIPES) throw new PhoneError("That text has enough versions", 400);
        const people = await cast(chat);
        const name = people.side(message.sender);
        const contact = people.contactOf(message.sender);
        const { text: story } = await storyTranscript(chat, (entry) =>
          entry.role === "user"
            ? people.personaName
            : entry.role === "narrator"
              ? "Narrator"
              : people.nameFor(entry.characterId ?? "") || "Character",
        );
        const raw = await complete(
          chat,
          buildTextSwipeMessages({
            name,
            who: contact
              ? contactWho(contact, people.personaName)
              : (people.members.find((member) => member.id === message.sender)?.about ?? ""),
            personaName: people.personaName,
            story,
            earlier: thread
              .filter((entry) => entry.id !== message.id && (entry.kind === "text" || entry.kind === "photo"))
              .slice(-8)
              .map((entry) => ({ name: people.side(entry.sender), text: entry.body })),
            versions: message.swipes.length ? message.swipes : [message.body],
          }),
          "text swipe",
          debug,
          600,
        );
        const fresh = readTextSwipe(raw, name);
        if (!fresh) throw new PhoneError("The model returned an empty text", 502);
        return phones.setVersions(message.id, applyTextSwipe(message, { added: fresh }));
      });
    },

    /** Turning the phone off drops whatever was waiting and any call. */
    async clearWaiting(chatId: string) {
      const chat = await getChat(chatId);
      const state = readPhoneRunState(parseRecord(chat.metadata));
      await saveState(chatId, { ...state, queue: state.queue.filter((item) => item.deliveredAt), call: null });
    },
  };
}

export function logPhoneFailure(error: unknown, what: string, chatId: string) {
  if (error instanceof PhoneError && error.status < 500) return;
  logger.warn(error, "[fork-phone] %s failed for chat %s", what, chatId);
}
