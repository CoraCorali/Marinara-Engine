// Fork feature: ending a chapter and writing its recap with a model (see FORK.md).
import type { DB } from "../../db/connection.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import { createCharactersStorage } from "../storage/characters.storage.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { resolveChatUserIdentity } from "../chat-user-identity.js";
import { resolveChatSummaryConnection } from "../chat-summary/connection-resolution.js";
import { resolveBaseUrl } from "../generation/connection-base-url.js";
import { listBondsBeforeTurn, listPairsBeforeTurn } from "../bonds/fork-bond-updates.js";
import { bondsPromptBlock } from "../generation/fork-bonds-prompt.js";
import { pairsPromptBlock } from "../bonds/fork-bond-pairs.js";
import { logDebugOverride, logger } from "../../lib/logger.js";
import { rememberThingsFromRecap } from "../board/fork-thing-updates.js";
import {
  buildEarlierMergeMessages,
  buildMergeMessages,
  buildRecapMessages,
  buildSliceNoteMessages,
  readRecap,
  RECAP_SLICE_MESSAGES,
  sliceMessages,
  type RecapSourceMessage,
} from "./fork-chapter-recap.js";
import {
  chaptersBefore,
  createChaptersStorage,
  needsEarlierMerge,
  readEarlierRecap,
  type Chapter,
} from "./fork-chapters.js";

type ChatRow = NonNullable<Awaited<ReturnType<ReturnType<typeof createChatsStorage>["getById"]>>>;
type MessageRow = Awaited<ReturnType<ReturnType<typeof createChatsStorage>["listMessages"]>>[number];

export class ChapterError extends Error {
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

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** What a reader of the chat sees: no system rows, nothing hidden from the user or command-only. */
function isStoryMessage(message: MessageRow): boolean {
  if (message.role === "system") return false;
  const extra = parseRecord(message.extra);
  return extra.hiddenFromUser !== true && extra.commandOnly !== true;
}

/** One recap call may take this long before it is given up on. */
const RECAP_CALL_TIMEOUT_MS = 300_000;

/** Chapters that end inside one chat at a time, since a recap takes several model calls. */
const busyChats = new Set<string>();

export function createChapterWriter(db: DB) {
  const chats = createChatsStorage(db);
  const characters = createCharactersStorage(db);
  const store = createChaptersStorage(db);

  async function provider(chat: ChatRow) {
    const resolved = await resolveChatSummaryConnection({
      chatConnectionId: chat.connectionId && chat.connectionId !== "random" ? chat.connectionId : null,
      defaultConnectionId: (await createConnectionsStorage(db).getDefault())?.id ?? null,
      chatMetadata: parseRecord(chat.metadata),
      connections: createConnectionsStorage(db),
      resolveBaseUrl,
    });
    if (!resolved.ok) throw new ChapterError(resolved.error, 400);
    return resolved;
  }

  async function nameResolver(chat: ChatRow) {
    const names = new Map<string, string>();
    for (const id of parseIds(chat.characterIds)) {
      const row = await characters.getById(id);
      const name = row ? parseRecord(row.data).name : null;
      if (typeof name === "string" && name.trim()) names.set(id, name.trim());
    }
    const identity = await resolveChatUserIdentity(characters, chat).catch(() => null);
    const personaName = identity?.name?.trim() || "User";
    return {
      personaName,
      nameFor: (characterId: string) => names.get(characterId) ?? "",
      messageName: (message: MessageRow) =>
        message.role === "user"
          ? personaName
          : message.role === "narrator"
            ? "Narrator"
            : (message.characterId && names.get(message.characterId)) || "Character",
    };
  }

  async function complete(
    resolved: Awaited<ReturnType<typeof provider>>,
    messages: { role: "system" | "user"; content: string }[],
    label: string,
    debug: boolean,
  ): Promise<string> {
    logDebugOverride(
      debug,
      "[debug/fork-chapters] %s prompt:\n%s",
      label,
      messages.map((entry) => `[${entry.role}]\n${entry.content}`).join("\n\n"),
    );
    // Streamed: a long recap can take a minute or more, and some gateways (LinkAPI among them)
    // drop a non-streamed request after about 30 seconds.
    // A stream a gateway never closes would keep the chapter busy until a restart.
    const signal = AbortSignal.timeout(RECAP_CALL_TIMEOUT_MS);
    const result = await resolved.provider.chatComplete(messages, {
      model: resolved.model,
      temperature: 0.4,
      maxTokens: 4096,
      stream: true,
      signal,
    });
    if (signal.aborted) throw new ChapterError("The model took too long to write the recap", 504);
    // A stream that broke part-way hands back what it had; a recap cut off mid-sentence is worse
    // than none, since it would quietly become the story's memory.
    if (result.finishReason === "error") throw new ChapterError("The model stopped partway through the recap", 502);
    return result.content ?? "";
  }

  /** The recap of `messages` as Chapter `number`. */
  async function writeRecap(
    chat: ChatRow,
    chapterMessages: readonly MessageRow[],
    number: number,
    previousTitles: string[],
    withPeople: boolean,
    debug: boolean,
  ): Promise<{ title: string; recap: string }> {
    const resolved = await provider(chat);
    const names = await nameResolver(chat);
    const people = withPeople
      ? [
          bondsPromptBlock(await listBondsBeforeTurn(db, chat.id), names.nameFor, names.personaName),
          pairsPromptBlock(await listPairsBeforeTurn(db, chat.id), names.nameFor),
        ]
          .filter(Boolean)
          .join("\n")
      : "";
    const source: RecapSourceMessage[] = chapterMessages.filter(isStoryMessage).map((message) => ({
      role: message.role,
      name: names.messageName(message),
      content: String(message.content ?? ""),
    }));
    if (source.length === 0) throw new ChapterError("This chapter has no messages to recap", 400);
    const context = {
      chapterNumber: number,
      messageCount: source.length,
      personaName: names.personaName,
      people,
      previousTitles,
    };

    let raw: string;
    if (source.length <= RECAP_SLICE_MESSAGES) {
      raw = await complete(resolved, buildRecapMessages(source, context), "recap", debug);
    } else {
      const slices = sliceMessages(source);
      const notes: string[] = [];
      for (const [index, slice] of slices.entries()) {
        const note = await complete(
          resolved,
          buildSliceNoteMessages(slice, index + 1, slices.length, context, notes[notes.length - 1]),
          `part ${index + 1}/${slices.length}`,
          debug,
        );
        if (!note.trim()) throw new ChapterError("The model returned empty notes for part of the chapter", 502);
        notes.push(note);
      }
      raw = await complete(resolved, buildMergeMessages(notes, context), "merge", debug);
    }
    const recap = readRecap(raw);
    if (!recap) throw new ChapterError("The model returned an empty recap", 502);
    return recap;
  }

  /** Merges the oldest recaps into one once the whole ones outgrow the budget. Never throws. */
  async function mergeEarlierIfNeeded(chat: ChatRow, all: readonly Chapter[], debug: boolean): Promise<void> {
    const earlier = readEarlierRecap(parseRecord(chat.metadata));
    if (!needsEarlierMerge(all, earlier)) return;
    try {
      // The two newest recaps always stay whole.
      const toMerge = all.filter((chapter) => chapter.number > (earlier?.through ?? 0)).slice(0, -2);
      if (toMerge.length === 0) return;
      const resolved = await provider(chat);
      const text = await complete(
        resolved,
        buildEarlierMergeMessages(toMerge, earlier?.text ?? ""),
        "earlier chapters merge",
        debug,
      );
      if (!text.trim()) return;
      const through = toMerge[toMerge.length - 1]!.number;
      await chats.patchMetadata(chat.id, () => ({ forkChaptersEarlier: { through, text: text.trim() } }));
    } catch (error) {
      // Without the merge every recap is still sent whole; the story loses nothing.
      logger.warn(error, "[fork-chapters] Could not merge the early recaps of chat %s", chat.id);
    }
  }

  /** A change to a merged chapter means the "Earlier" recap no longer matches it. */
  async function dropEarlierFrom(chat: ChatRow, number: number): Promise<void> {
    const earlier = readEarlierRecap(parseRecord(chat.metadata));
    if (earlier && number <= earlier.through) {
      await chats.patchMetadata(chat.id, () => ({ forkChaptersEarlier: null }));
    }
  }

  /** The board's things keep what the recap says about them. Never throws: the recap is saved. */
  async function rememberThings(chatId: string, number: number, recap: string): Promise<void> {
    await rememberThingsFromRecap(db, chatId, number, recap).catch((error) =>
      logger.warn(error, "[fork-chapters] Could not add chapter %d's memories to the board", number),
    );
  }

  async function getChat(chatId: string): Promise<ChatRow> {
    const chat = await chats.getById(chatId);
    if (!chat) throw new ChapterError("Chat not found", 404);
    return chat;
  }

  async function withLock<T>(chatId: string, work: () => Promise<T>): Promise<T> {
    if (busyChats.has(chatId)) throw new ChapterError("A chapter recap is already being written", 409);
    busyChats.add(chatId);
    try {
      return await work();
    } finally {
      busyChats.delete(chatId);
    }
  }

  return {
    /**
     * Ends the current chapter at `upToMessageId` (the newest message when empty): writes its recap
     * and folds it. Ending at an older message of the current chapter splits it, which is also how
     * an old chat is cut into chapters after the fact.
     */
    async endChapter(chatId: string, upToMessageId: string | null, debug: boolean): Promise<Chapter> {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        if (chat.mode !== "roleplay") throw new ChapterError("Chapters are for roleplay chats", 400);
        const all = await store.listForChat(chatId);
        const messages = await chats.listMessages(chatId);
        const { startIndex } = chaptersBefore(all, messages);
        const endIndex = upToMessageId
          ? messages.findIndex((message) => message.id === upToMessageId)
          : messages.length - 1;
        if (endIndex < 0) throw new ChapterError("Message not found", 404);
        if (endIndex < startIndex) throw new ChapterError("That message is already in a finished chapter", 400);
        const chapterMessages = messages.slice(startIndex, endIndex + 1);
        const number = all.reduce((highest, chapter) => Math.max(highest, chapter.number), 0) + 1;
        // People only describes the chapter's end when the chapter ends at the newest message.
        const recap = await writeRecap(
          chat,
          chapterMessages,
          number,
          all.map((chapter) => chapter.title || `Chapter ${chapter.number}`),
          endIndex === messages.length - 1,
          debug,
        );
        const first = chapterMessages[0]!;
        const last = chapterMessages[chapterMessages.length - 1]!;
        const chapter = await store.create({
          chatId,
          title: recap.title,
          first: { id: first.id, createdAt: String(first.createdAt) },
          last: { id: last.id, createdAt: String(last.createdAt) },
          messageCount: chapterMessages.filter(isStoryMessage).length,
          recap: recap.recap,
        });
        await mergeEarlierIfNeeded(chat, [...all, chapter], debug);
        await rememberThings(chatId, chapter.number, chapter.recap);
        return chapter;
      });
    },

    /** A fresh recap for a finished chapter, e.g. after a message inside it changed. */
    async rewriteRecap(chapterId: string, debug: boolean): Promise<Chapter> {
      const chapter = await store.get(chapterId);
      if (!chapter) throw new ChapterError("Chapter not found", 404);
      return withLock(chapter.chatId, async () => {
        const chat = await getChat(chapter.chatId);
        const all = await store.listForChat(chapter.chatId);
        const messages = await chats.listMessages(chapter.chatId);
        const index = all.findIndex((entry) => entry.id === chapter.id);
        const before = chaptersBefore(all.slice(0, index), messages).startIndex;
        const after = chaptersBefore(all.slice(0, index + 1), messages).startIndex;
        const recap = await writeRecap(
          chat,
          messages.slice(before, after),
          chapter.number,
          all.slice(0, index).map((entry) => entry.title || `Chapter ${entry.number}`),
          index === all.length - 1,
          debug,
        );
        const updated = await store.update(chapter.id, { recap: recap.recap });
        await dropEarlierFrom(chat, chapter.number);
        await rememberThings(chapter.chatId, chapter.number, recap.recap);
        return updated!;
      });
    },

    /** The writer's own edit of a title or recap. */
    async editRecap(chapterId: string, patch: { title?: unknown; recap?: unknown }): Promise<Chapter> {
      const chapter = await store.get(chapterId);
      if (!chapter) throw new ChapterError("Chapter not found", 404);
      const updated = await store.update(chapterId, patch);
      if (typeof patch.recap === "string") await dropEarlierFrom(await getChat(chapter.chatId), chapter.number);
      return updated!;
    },

    /** "Continue this chapter": the last chapter opens again and its recap goes. */
    async reopenLast(chatId: string): Promise<Chapter | null> {
      return withLock(chatId, async () => {
        const chat = await getChat(chatId);
        const all = await store.listForChat(chatId);
        const last = all[all.length - 1];
        if (!last) return null;
        await store.remove(last.id);
        await dropEarlierFrom(chat, last.number);
        return last;
      });
    },
  };
}
