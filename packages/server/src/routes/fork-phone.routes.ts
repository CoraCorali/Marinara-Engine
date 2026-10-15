// Fork feature: the Pocket Phone API (see FORK.md).
import type { FastifyInstance } from "fastify";
import {
  forkPhoneContactName,
  FORK_PHONE_RELATIONS,
  MAX_FORK_PHONE_CONTACTS,
  MAX_FORK_PHONE_CONTACT_NOTE,
  normalizeForkPhoneLook,
  readForkPhoneSettings,
  type ForkPhoneContact,
  type ForkPhoneRelation,
} from "@marinara-engine/shared";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createCharactersStorage } from "../services/storage/characters.storage.js";
import { createGameStateStorage } from "../services/storage/game-state.storage.js";
import { createPhoneStorage, PHONE_CONTACT, PHONE_PERSONA, phoneSide } from "../services/phone/fork-phone.js";
import { readPhoneRunState } from "../services/phone/fork-phone-agent.js";
import { readWrittenPhones } from "../services/phone/fork-phone-peek.js";
import { createPhoneRunner, logPhoneFailure, PhoneError } from "../services/phone/fork-phone-runner.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";

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

export async function forkPhoneRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const phones = createPhoneStorage(app.db);
  const runner = createPhoneRunner(app.db);
  const debugOf = (body: unknown) => parseRecord(body).debugMode === true || isDebugAgentsEnabled();
  /** Runs a phone step, turning its known failures into replies. */
  async function step<T>(
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
    chatId: string,
    what: string,
    work: () => Promise<T>,
  ) {
    try {
      return await work();
    } catch (error) {
      logPhoneFailure(error, what, chatId);
      const status = error instanceof PhoneError ? error.status : 502;
      return reply.status(status).send({ error: error instanceof Error ? error.message : "The phone did not answer" });
    }
  }

  /** The chat's phone settings, threads and texts. */
  app.get<{ Params: { chatId: string } }>("/chats/:chatId", async (req, reply) => {
    const chat = await chats.getById(req.params.chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    const run = readPhoneRunState(parseRecord(chat.metadata));
    const threads = await phones.listThreads(chat.id);
    // Names of every character with a thread, so one who left the chat still reads as themselves.
    const names: Record<string, string> = {};
    const characters = createCharactersStorage(app.db);
    for (const side of new Set(threads.flatMap((thread) => [thread.a, thread.b]))) {
      if (side === PHONE_PERSONA || side.startsWith(PHONE_CONTACT)) continue;
      const name = parseRecord((await characters.getById(side))?.data).name;
      if (typeof name === "string" && name.trim()) names[side] = name.trim();
    }
    return {
      settings: readForkPhoneSettings(parseRecord(chat.metadata)),
      threads,
      names,
      messages: await phones.listMessages(chat.id),
      call: run.call,
      waiting: run.queue.filter((item) => !item.deliveredAt).length,
      reachable: run.reachable,
      peeks: run.peeks,
      /** Characters whose phone has been written, with their camera roll. */
      written: readWrittenPhones(parseRecord(chat.metadata)),
    };
  });

  /** Switch the phone on or off, or change how a phone looks. */
  app.patch<{ Params: { chatId: string } }>("/chats/:chatId/settings", async (req, reply) => {
    const body = parseRecord(req.body);
    const updated = await chats.patchMetadata(req.params.chatId, (meta) => {
      const current = readForkPhoneSettings(meta);
      const look = normalizeForkPhoneLook({ ...current, ...body }, current);
      const characterLooks = { ...current.characterLooks };
      const lookFor = parseRecord(body.characterLook);
      if (typeof lookFor.id === "string" && lookFor.id) {
        characterLooks[lookFor.id] = normalizeForkPhoneLook(
          { ...characterLooks[lookFor.id], ...parseRecord(lookFor.look) },
          normalizeForkPhoneLook(characterLooks[lookFor.id]),
        );
      }
      return {
        forkPhone: {
          ...look,
          on: typeof body.on === "boolean" ? body.on : current.on,
          characterLooks,
          contacts: current.contacts,
        },
      };
    });
    if (!updated) return reply.status(404).send({ error: "Chat not found" });
    // Switched off mid-story: what was waiting to arrive is dropped, not delivered later.
    if (body.on === false) await runner.clearWaiting(updated.id);
    return readForkPhoneSettings(parseRecord(updated.metadata));
  });

  /** You text someone: a card character or a contact. It sits after the newest story message. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/texts", async (req, reply) => {
    const body = parseRecord(req.body);
    const to = phoneSide(body.to);
    const text = typeof body.body === "string" ? body.body : "";
    if (!to || to === PHONE_PERSONA) return reply.status(400).send({ error: "Who is the text for?" });
    if (!text.trim()) return reply.status(400).send({ error: "The text is empty" });
    const chat = await chats.getById(req.params.chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    const settings = readForkPhoneSettings(parseRecord(chat.metadata));
    if (!settings.on) return reply.status(400).send({ error: "The phone is off for this chat" });
    if (to.startsWith(PHONE_CONTACT) && !settings.contacts.some((contact) => PHONE_CONTACT + contact.name === to)) {
      return reply.status(400).send({ error: "That contact is not in your phone" });
    }
    const [latest] = (await chats.listMessagePreviews(chat.id, 1)) as { id: string }[];
    const scene = await createGameStateStorage(app.db).getLatest(chat.id);
    const thread = await phones.ensureThread(chat.id, PHONE_PERSONA, to);
    const message = await phones.addMessage({
      chatId: chat.id,
      threadId: thread.id,
      sender: PHONE_PERSONA,
      body: text,
      storyTime: typeof scene?.time === "string" ? scene.time : "",
      afterMessageId: latest?.id ?? "",
      source: "user",
    });
    if (!message) return reply.status(400).send({ error: "The phone is full" });
    return message;
  });

  /** Your own text, corrected; the writer is told the new version. */
  app.patch<{ Params: { id: string } }>("/messages/:id", async (req, reply) => {
    const message = await phones.getMessage(req.params.id);
    if (!message) return reply.status(404).send({ error: "Text not found" });
    if (message.sender !== PHONE_PERSONA) return reply.status(400).send({ error: "Only your own texts can be edited" });
    const updated = await phones.editMessage(message.id, String(parseRecord(req.body).body ?? ""));
    if (!updated) return reply.status(400).send({ error: "The text is empty" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/messages/:id", async (req, reply) => {
    const message = await phones.getMessage(req.params.id);
    if (!message) return reply.status(404).send({ error: "Text not found" });
    await phones.removeMessage(message.id);
    return { success: true };
  });

  app.post<{ Params: { id: string } }>("/threads/:id/read", async (req, reply) => {
    if (!(await phones.getThread(req.params.id))) return reply.status(404).send({ error: "Thread not found" });
    await phones.markRead(req.params.id);
    return { success: true };
  });

  /** After a story reply (or a new swipe of it): the phone agent decides who texts or calls. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/after-reply", async (req, reply) => {
    const messageId = String(parseRecord(req.body).messageId ?? "");
    if (!messageId) return reply.status(400).send({ error: "Which reply?" });
    return step(reply, req.params.chatId, "The phone agent", () =>
      runner.afterReply(req.params.chatId, messageId, debugOf(req.body)),
    );
  });

  /** You stayed in the chat a while without writing: waiting texts arrive. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/idle", async (req, reply) =>
    step(reply, req.params.chatId, "Idle delivery", () => runner.deliverIdle(req.params.chatId)),
  );

  app.post<{ Params: { chatId: string } }>("/chats/:chatId/calls", async (req, reply) =>
    step(reply, req.params.chatId, "Calling", () =>
      runner.callOut(req.params.chatId, String(parseRecord(req.body).to ?? "")),
    ),
  );
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/call/answer", async (req, reply) =>
    step(reply, req.params.chatId, "Answering", () => runner.answer(req.params.chatId)),
  );
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/call/decline", async (req, reply) =>
    step(reply, req.params.chatId, "Declining", () => runner.decline(req.params.chatId)),
  );
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/call/say", async (req, reply) =>
    step(reply, req.params.chatId, "A call line", () =>
      runner.say(req.params.chatId, String(parseRecord(req.body).line ?? ""), debugOf(req.body)),
    ),
  );
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/call/hang-up", async (req, reply) =>
    step(reply, req.params.chatId, "Hanging up", () => runner.hangUp(req.params.chatId)),
  );

  /** Look at a character's phone the story left within reach. The first look writes it. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/peek", async (req, reply) =>
    step(reply, req.params.chatId, "Peeking", () =>
      runner.peek(req.params.chatId, String(parseRecord(req.body).characterId ?? ""), debugOf(req.body)),
    ),
  );
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/peek/seen", async (req, reply) => {
    const body = parseRecord(req.body);
    return step(reply, req.params.chatId, "Peek reading", () =>
      runner.peekSeen(req.params.chatId, String(body.characterId ?? ""), String(body.threadId ?? "")),
    );
  });

  /** Changes your contacts list. Returns the list, or an error message for the person. */
  async function editContacts(
    chatId: string,
    change: (contacts: ForkPhoneContact[]) => ForkPhoneContact[] | string,
  ): Promise<{ contacts: ForkPhoneContact[] } | { error: string; status: number }> {
    let failure = "";
    const updated = await chats.patchMetadata(chatId, (meta) => {
      const current = readForkPhoneSettings(meta);
      const next = change(current.contacts.map((contact) => ({ ...contact })));
      if (typeof next === "string") {
        failure = next;
        return {};
      }
      return { forkPhone: { ...parseRecord(meta.forkPhone), contacts: next } };
    });
    if (!updated) return { error: "Chat not found", status: 404 };
    if (failure) return { error: failure, status: 400 };
    return { contacts: readForkPhoneSettings(parseRecord(updated.metadata)).contacts };
  }
  const relationOf = (value: unknown): ForkPhoneRelation | null =>
    (FORK_PHONE_RELATIONS as readonly string[]).includes(value as string) ? (value as ForkPhoneRelation) : null;
  const noteOf = (value: unknown) =>
    typeof value === "string" ? value.trim().slice(0, MAX_FORK_PHONE_CONTACT_NOTE) : "";

  /** A new contact: someone without a card you can text, like Mom or a coworker. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/contacts", async (req, reply) => {
    const body = parseRecord(req.body);
    const name = forkPhoneContactName(body.name);
    const result = await editContacts(req.params.chatId, (contacts) => {
      if (!name) return "Give the contact a name";
      if (contacts.some((contact) => contact.name.toLowerCase() === name.toLowerCase()))
        return "You already have a contact with that name";
      if (contacts.length >= MAX_FORK_PHONE_CONTACTS) return "Your phone is full of contacts";
      return [...contacts, { name, relation: relationOf(body.relation) ?? "other", note: noteOf(body.note) }];
    });
    return "error" in result ? reply.status(result.status).send({ error: result.error }) : result;
  });

  /** What they are to you, or who they are. A name stays, since their texts are found by it. */
  app.patch<{ Params: { chatId: string; name: string } }>("/chats/:chatId/contacts/:name", async (req, reply) => {
    const body = parseRecord(req.body);
    const result = await editContacts(req.params.chatId, (contacts) => {
      const contact = contacts.find((entry) => entry.name === req.params.name);
      if (!contact) return "That contact is not in your phone";
      if (body.relation !== undefined) contact.relation = relationOf(body.relation) ?? contact.relation;
      if (body.note !== undefined) contact.note = noteOf(body.note);
      return contacts;
    });
    return "error" in result ? reply.status(result.status).send({ error: result.error }) : result;
  });

  /** Deletes a contact and your texts with them. */
  app.delete<{ Params: { chatId: string; name: string } }>("/chats/:chatId/contacts/:name", async (req, reply) => {
    const result = await editContacts(req.params.chatId, (contacts) =>
      contacts.some((contact) => contact.name === req.params.name)
        ? contacts.filter((contact) => contact.name !== req.params.name)
        : "That contact is not in your phone",
    );
    if ("error" in result) return reply.status(result.status).send({ error: result.error });
    const side = PHONE_CONTACT + req.params.name;
    for (const thread of await phones.listThreads(req.params.chatId)) {
      if ((thread.a === PHONE_PERSONA && thread.b === side) || (thread.b === PHONE_PERSONA && thread.a === side)) {
        await phones.removeThread(thread.id);
      }
    }
    return result;
  });

  /** A contact answers your newest text. */
  app.post<{ Params: { chatId: string; name: string } }>("/chats/:chatId/contacts/:name/reply", async (req, reply) =>
    step(reply, req.params.chatId, "A contact's reply", () =>
      runner.contactReply(req.params.chatId, req.params.name, debugOf(req.body)),
    ),
  );
}
