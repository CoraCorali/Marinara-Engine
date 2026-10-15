// Fork feature: the Pocket Phone API (see FORK.md).
import type { FastifyInstance } from "fastify";
import { normalizeForkPhoneLook, readForkPhoneSettings } from "@marinara-engine/shared";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createGameStateStorage } from "../services/storage/game-state.storage.js";
import { createPhoneStorage, PHONE_PERSONA, phoneSide } from "../services/phone/fork-phone.js";
import { readPhoneRunState } from "../services/phone/fork-phone-agent.js";
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
    return {
      settings: readForkPhoneSettings(parseRecord(chat.metadata)),
      threads: await phones.listThreads(chat.id),
      messages: await phones.listMessages(chat.id),
      call: run.call,
      waiting: run.queue.filter((item) => !item.deliveredAt).length,
      reachable: run.reachable,
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
      return { forkPhone: { ...look, on: typeof body.on === "boolean" ? body.on : current.on, characterLooks } };
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
    if (!readForkPhoneSettings(parseRecord(chat.metadata)).on) {
      return reply.status(400).send({ error: "The phone is off for this chat" });
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
}
