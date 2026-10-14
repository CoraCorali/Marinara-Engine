// Fork feature: Fix this part (see FORK.md).
//
// Rewrites one passage of a reply with the chat's own model and hands back the replacement. It
// saves nothing: the writer sees the rewrite next to the original and keeps it through the normal
// message edit, so an unwanted rewrite never touches the story.
import type { FastifyInstance } from "fastify";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createCharactersStorage } from "../services/storage/characters.storage.js";
import { resolveChatUserIdentity } from "../services/chat-user-identity.js";
import { resolveForkChatProvider } from "../services/generation/fork-chat-provider.js";
import { buildFixPartMessages, isValidFixRange, readFixPartReply } from "../services/generation/fork-fix-part.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";
import { logDebugOverride, logger } from "../lib/logger.js";

export async function forkFixRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const characters = createCharactersStorage(app.db);

  app.post("/part", async (req, reply) => {
    const body = (req.body ?? {}) as {
      chatId?: unknown;
      messageId?: unknown;
      start?: unknown;
      end?: unknown;
      expected?: unknown;
      instruction?: unknown;
      avoid?: unknown;
      debugMode?: unknown;
    };
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const start = typeof body.start === "number" ? body.start : -1;
    const end = typeof body.end === "number" ? body.end : -1;
    if (!chatId || !messageId) return reply.status(400).send({ error: "chatId and messageId are required" });

    const chat = await chats.getById(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    const message = await chats.getMessage(messageId);
    if (!message || message.chatId !== chatId) return reply.status(404).send({ error: "Message not found" });
    if (message.role !== "assistant" && message.role !== "narrator") {
      return reply.status(400).send({ error: "Only a reply can be fixed this way" });
    }
    const content = String(message.content ?? "");
    if (!isValidFixRange(content, start, end))
      return reply.status(400).send({ error: "That passage is not in the reply" });
    // The reply may have changed since the passage was picked; never rewrite the wrong words.
    if (typeof body.expected === "string" && content.slice(start, end) !== body.expected) {
      return reply.status(409).send({ error: "The reply changed since you picked that passage" });
    }

    const resolved = await resolveForkChatProvider(app.db, chat);
    if (!resolved.ok) return reply.status(400).send({ error: resolved.error });

    // The writer's turn just before this reply, so the rewrite answers the same thing.
    const recent = await chats.listMessagePreviews(chatId, 30);
    const index = recent.findIndex((row) => row.id === messageId);
    const previousTurn =
      index > 0 ? ([...recent.slice(0, index)].reverse().find((row) => row.role === "user")?.content ?? null) : null;
    const identity = await resolveChatUserIdentity(characters, chat).catch(() => null);

    const messages = buildFixPartMessages({
      reply: content,
      start,
      end,
      instruction: typeof body.instruction === "string" ? body.instruction : null,
      avoid: Array.isArray(body.avoid) ? body.avoid.filter((item): item is string => typeof item === "string") : [],
      previousTurn: typeof previousTurn === "string" ? previousTurn : null,
      writerName: identity?.name ?? null,
    });
    logDebugOverride(
      body.debugMode === true || isDebugAgentsEnabled(),
      "[debug/fork-fix] prompt for message %s:\n%s",
      messageId,
      messages.map((entry) => `[${entry.role}]\n${entry.content}`).join("\n\n"),
    );

    let raw = "";
    try {
      const result = await resolved.provider.chatComplete(messages, { model: resolved.model, temperature: 0.8 });
      raw = result.content ?? "";
    } catch (error) {
      logger.error(error, "[fork-fix] The model could not rewrite the passage");
      return reply
        .status(502)
        .send({ error: error instanceof Error ? error.message : "The model could not rewrite that" });
    }
    const replacement = readFixPartReply(raw, content.slice(start, end));
    if (!replacement.trim()) return reply.status(502).send({ error: "The model returned an empty rewrite" });
    return { replacement };
  });
}
