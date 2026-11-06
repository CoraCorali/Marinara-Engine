// Fork feature: the model a chat writes with, for the fork's side calls (the Director, Fix this
// part). Resolved the same way for each, so they always talk to the model the story uses.
import type { DB } from "../../db/connection.js";
import { createLLMProvider } from "../llm/provider-registry.js";
import { resolveBaseUrl } from "./connection-base-url.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { applyChatModelOverride, readChatModelOverride } from "./connection-resolution.js";

type ChatLike = { connectionId?: string | null; metadata?: unknown };

export type ForkChatProvider =
  { ok: true; provider: ReturnType<typeof createLLMProvider>; model: string } | { ok: false; error: string };

/** The chat's own connection, else an explicit one, else the default. "Random" falls to the default. */
export async function resolveForkChatProvider(
  db: DB,
  chat: ChatLike,
  requestedConnectionId?: unknown,
): Promise<ForkChatProvider> {
  const connections = createConnectionsStorage(db);
  const connectionId =
    (typeof requestedConnectionId === "string" && requestedConnectionId) ||
    (chat.connectionId && chat.connectionId !== "random" ? chat.connectionId : "") ||
    (await connections.getDefault())?.id ||
    "";
  if (!connectionId) return { ok: false, error: "No API connection configured for this chat" };
  const storedConn = await connections.getWithKey(connectionId);
  if (!storedConn) return { ok: false, error: "API connection not found" };
  // The model picked for this chat, when it is this chat's own connection, as generation does.
  const conn = applyChatModelOverride(storedConn, readChatModelOverride(chat));
  const baseUrl = resolveBaseUrl(conn);
  if (!baseUrl) return { ok: false, error: "No base URL configured for this connection" };
  const provider = createLLMProvider(
    conn.provider,
    baseUrl,
    conn.apiKey,
    conn.maxContext,
    conn.openrouterProvider,
    conn.maxTokensOverride,
    conn.claudeFastMode === "true",
    conn.treatAsLocalEndpoint === "true",
    conn.defaultParameters,
    conn.id,
  );
  return { ok: true, provider, model: conn.model };
}
