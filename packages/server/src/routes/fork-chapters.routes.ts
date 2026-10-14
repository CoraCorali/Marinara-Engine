// Fork feature: the chapters API (see FORK.md).
import type { FastifyInstance, FastifyReply } from "fastify";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { chaptersBefore, createChaptersStorage, LONG_CHAPTER_MESSAGES } from "../services/chapters/fork-chapters.js";
import { ChapterError, createChapterWriter } from "../services/chapters/fork-chapter-writer.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";
import { logger } from "../lib/logger.js";

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof ChapterError) return reply.status(error.status).send({ error: error.message });
  logger.error(error, "[fork-chapters] Chapter request failed");
  return reply.status(502).send({ error: error instanceof Error ? error.message : "The recap could not be written" });
}

function debugFlag(body: unknown): boolean {
  return (body as { debugMode?: unknown } | null)?.debugMode === true || isDebugAgentsEnabled();
}

export async function forkChaptersRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const store = createChaptersStorage(app.db);
  const writer = createChapterWriter(app.db);

  /** The chat's finished chapters, and where the current one stands. */
  app.get<{ Params: { chatId: string } }>("/chats/:chatId", async (req, reply) => {
    if (!(await chats.getById(req.params.chatId))) return reply.status(404).send({ error: "Chat not found" });
    const chapters = await store.listForChat(req.params.chatId);
    const messages = await chats.listMessages(req.params.chatId);
    const { finished, startIndex } = chaptersBefore(chapters, messages);
    return {
      chapters,
      current: {
        number: (finished[finished.length - 1]?.number ?? 0) + 1,
        firstMessageId: messages[startIndex]?.id ?? null,
        messageCount: messages.length - startIndex,
      },
      longChapter: LONG_CHAPTER_MESSAGES,
    };
  });

  /** Ends the current chapter at a message (the newest when none is given). */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/end", async (req, reply) => {
    const body = (req.body ?? {}) as { upToMessageId?: unknown };
    const upTo = typeof body.upToMessageId === "string" && body.upToMessageId ? body.upToMessageId : null;
    try {
      return await writer.endChapter(req.params.chatId, upTo, debugFlag(req.body));
    } catch (error) {
      return fail(reply, error);
    }
  });

  /** "Continue this chapter": reopens the last finished chapter. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/reopen", async (req, reply) => {
    try {
      const reopened = await writer.reopenLast(req.params.chatId);
      if (!reopened) return reply.status(404).send({ error: "No finished chapter to continue" });
      return { reopened };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const body = (req.body ?? {}) as { title?: unknown; recap?: unknown };
    try {
      return await writer.editRecap(req.params.id, body);
    } catch (error) {
      return fail(reply, error);
    }
  });

  /** A fresh recap for a finished chapter. */
  app.post<{ Params: { id: string } }>("/:id/recap", async (req, reply) => {
    try {
      return await writer.rewriteRecap(req.params.id, debugFlag(req.body));
    } catch (error) {
      return fail(reply, error);
    }
  });
}
