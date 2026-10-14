// Fork feature: the Director's chair (see FORK.md).
//
// An off-the-record conversation about the scene. Nothing said here enters the roleplay: the user
// talks through what the last reply got wrong, and the Director keeps a short note that the chat
// can then apply as a guided regeneration.
import type { FastifyInstance } from "fastify";
import { createLLMProvider } from "../services/llm/provider-registry.js";
import { resolveBaseUrl } from "../services/generation/connection-base-url.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createCharactersStorage } from "../services/storage/characters.storage.js";
import { createConnectionsStorage } from "../services/storage/connections.storage.js";
import { cardPromptText } from "../services/prompt/card-text.js";

const SYSTEM_PROMPT = `You are the Director: the person the writer talks to between takes about their roleplay.

This conversation is off the record. Nothing you say is ever shown in the story, and the characters never learn about it.

Your job is to help the writer work out what the next reply should do. Be brief, concrete and practical, like a writing partner who has read every card. Two or three sentences is usually plenty.

- Ground what you say in the character cards, the persona and what actually happened in the scene. Name the detail you are using.
- When the writer says a character acted wrong, say what that character would do instead and why their card supports it.
- Disagree when the cards or the scene do not support what the writer is asking for. Say so plainly, then offer what would work.
- Never write the roleplay reply itself, and never write dialogue or actions for anyone. You describe what should happen, you do not perform it.

Return only valid JSON in this exact shape, with nothing before or after it:
{"say": "what you are telling the writer", "note": "the direction for the next reply, or an empty string"}

The "note" is what the story's writer model will be told to do on the next reply. Keep it one or two plain sentences describing what happens and how it is played, with no names for the writer and no meta talk. Build it from everything agreed so far in this conversation, not just the last message. Leave it empty only while nothing has been decided yet.`;

const MAX_TURNS = 24;
const MAX_SCENE_MESSAGES = 10;
const MAX_FIELD_CHARS = 1200;
const MAX_MESSAGE_CHARS = 1500;

/** Plain text only: a card or a reply can carry markup the Director has no use for. */
function clamp(value: unknown, limit: number): string {
  return typeof value === "string"
    ? value
        .replace(/<[^>]{0,2000}>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit)
    : "";
}

export async function forkDirectorRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const characters = createCharactersStorage(app.db);
  const connections = createConnectionsStorage(app.db);

  /** One off-record turn. The client keeps the conversation and sends it back each time. */
  app.post("/talk", async (req, reply) => {
    const body = (req.body ?? {}) as {
      chatId?: unknown;
      messages?: unknown;
      connectionId?: unknown;
    };
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    if (!chatId) return reply.status(400).send({ error: "chatId is required" });

    const turns = (Array.isArray(body.messages) ? body.messages : [])
      .filter((turn): turn is { role: string; content: string } => {
        if (!turn || typeof turn !== "object") return false;
        const candidate = turn as { role?: unknown; content?: unknown };
        return (
          (candidate.role === "user" || candidate.role === "assistant") &&
          typeof candidate.content === "string" &&
          candidate.content.trim().length > 0
        );
      })
      .slice(-MAX_TURNS)
      .map((turn) => ({
        role: turn.role as "user" | "assistant",
        content: turn.content.slice(0, MAX_MESSAGE_CHARS),
      }));
    if (turns.length === 0 || turns[turns.length - 1]!.role !== "user") {
      return reply.status(400).send({ error: "The last message must be from you" });
    }

    const chat = await chats.getById(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });

    const connectionId =
      (typeof body.connectionId === "string" && body.connectionId) ||
      (chat.connectionId && chat.connectionId !== "random" ? chat.connectionId : "") ||
      (await connections.getDefault())?.id ||
      "";
    if (!connectionId) return reply.status(400).send({ error: "No API connection configured for this chat" });
    const conn = await connections.getWithKey(connectionId);
    if (!conn) return reply.status(400).send({ error: "API connection not found" });

    const baseUrl = resolveBaseUrl(conn);
    if (!baseUrl) return reply.status(400).send({ error: "No base URL configured for this connection" });

    // ── The scene, compactly: who is in it, who the writer plays, and what just happened ──
    const characterIds: string[] = (() => {
      try {
        const parsed = JSON.parse(String(chat.characterIds ?? "[]"));
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
      } catch {
        return [];
      }
    })();
    const cardRows = (await Promise.all(characterIds.slice(0, 6).map((id) => characters.getById(id)))).filter(
      (row): row is NonNullable<typeof row> => Boolean(row),
    );
    const cardBlock = cardRows
      .map((row) => {
        let card: { name?: unknown; description?: unknown; personality?: unknown } = {};
        try {
          card = JSON.parse(row.data) as typeof card;
        } catch {
          return "";
        }
        const description = clamp(cardPromptText(String(card.description ?? "")), MAX_FIELD_CHARS);
        const personality = clamp(cardPromptText(String(card.personality ?? "")), MAX_FIELD_CHARS);
        return [
          `Name: ${clamp(card.name, 120) || "Unknown"}`,
          description && `Description: ${description}`,
          personality && `Personality: ${personality}`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .filter(Boolean)
      .join("\n\n");

    // Only the tail matters here, and a long roleplay should not be read whole on every turn.
    const recent = await chats.listMessagesPaginated(chatId, MAX_SCENE_MESSAGES);
    const sceneBlock = recent
      .map((message) => `${message.role === "assistant" ? "Story" : "Writer"}: ${clamp(message.content, 600)}`)
      .filter((line) => line.length > 8)
      .join("\n\n");

    const contextParts = [
      cardBlock ? `<characters>\n${cardBlock}\n</characters>` : "",
      sceneBlock ? `<recent_scene>\n${sceneBlock}\n</recent_scene>` : "",
    ].filter(Boolean);

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

    const result = await provider.chatComplete(
      [{ role: "system", content: `${SYSTEM_PROMPT}\n\n${contextParts.join("\n\n")}` }, ...turns],
      { model: conn.model, temperature: 0.6 },
    );

    const raw = (result.content ?? "").trim();
    // A model that ignores the JSON shape still has something useful to say, so keep its words.
    let say = raw;
    let note = "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as { say?: unknown; note?: unknown };
        if (typeof parsed.say === "string" && parsed.say.trim()) say = parsed.say.trim();
        if (typeof parsed.note === "string") note = parsed.note.trim();
      } catch {
        // Keep the raw text.
      }
    }
    if (!say) return reply.status(502).send({ error: "The model returned an empty response" });
    return { say, note };
  });
}
