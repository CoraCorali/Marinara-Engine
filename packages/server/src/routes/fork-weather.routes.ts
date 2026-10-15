// Fork feature: the season where the story is (see FORK.md).
import type { FastifyInstance } from "fastify";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createConnectionsStorage } from "../services/storage/connections.storage.js";
import { createGameStateStorage } from "../services/storage/game-state.storage.js";
import { resolveChatSummaryConnection } from "../services/chat-summary/connection-resolution.js";
import { resolveBaseUrl } from "../services/generation/connection-base-url.js";
import {
  buildSeasonMessages,
  northernSeason,
  readSeasonAnswer,
  seasonCacheKey,
  storyMonth,
} from "../services/weather/fork-season.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";
import { logDebugOverride, logger } from "../lib/logger.js";

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

export async function forkWeatherRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);

  /**
   * The season at the story's date and place. Answers from the chat's cache when the place and
   * month are the same as last time; otherwise asks the model once. Falls back to the month
   * (northern hemisphere) when there is no model or it fails, and to null when there is no date.
   */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/season", async (req, reply) => {
    const chat = await chats.getById(req.params.chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    const scene = await createGameStateStorage(app.db).getLatest(chat.id);
    const date = typeof scene?.date === "string" ? scene.date : "";
    const location = typeof scene?.location === "string" ? scene.location : "";
    const key = seasonCacheKey(date, location);
    if (!key) return { season: null, source: "none" };
    const cached = parseRecord(parseRecord(chat.metadata).forkSeason);
    if (cached.key === key && typeof cached.season === "string") return { season: cached.season, source: "cache" };

    const fallback = { season: northernSeason(storyMonth(date)), source: "fallback" };
    const metadata = parseRecord(chat.metadata);
    const resolved = await resolveChatSummaryConnection({
      chatConnectionId: chat.connectionId && chat.connectionId !== "random" ? chat.connectionId : null,
      defaultConnectionId: (await createConnectionsStorage(app.db).getDefault())?.id ?? null,
      chatMetadata: metadata,
      connections: createConnectionsStorage(app.db),
      resolveBaseUrl,
    });
    if (!resolved.ok) return fallback;
    const messages = buildSeasonMessages(date, location);
    logDebugOverride(
      (req.body as { debugMode?: unknown } | null)?.debugMode === true || isDebugAgentsEnabled(),
      "[debug/fork-season] prompt for chat %s:\n%s",
      chat.id,
      messages.map((message) => `[${message.role}]\n${message.content}`).join("\n\n"),
    );
    // A one-word answer: asked plainly first, then streamed once if the gateway fails (LinkAPI
    // drops some requests of either kind at random; a second try in the other shape gets through).
    const ask = (stream: boolean) =>
      resolved.provider.chatComplete(messages, { model: resolved.model, temperature: 0, maxTokens: 300, stream });
    try {
      const result = await ask(false).catch(() => ask(true));
      const season = readSeasonAnswer(result.content ?? "");
      if (!season) return fallback;
      await chats.patchMetadata(chat.id, () => ({ forkSeason: { key, season } }));
      return { season, source: "model" };
    } catch (error) {
      logger.warn(error, "[fork-season] Could not ask the model for chat %s; using the month", chat.id);
      return fallback;
    }
  });
}
