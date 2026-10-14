// Fork feature: the Director's chair (see FORK.md).
//
// An off-the-record conversation about the scene. Nothing said here enters the roleplay: the user
// talks through what the last reply got wrong, and the Director keeps a short note that the chat
// can then apply as a guided regeneration.
import type { FastifyInstance } from "fastify";
import type { LorebookEntry } from "@marinara-engine/shared";
import { resolveForkChatProvider } from "../services/generation/fork-chat-provider.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createCharactersStorage } from "../services/storage/characters.storage.js";
import { createLorebooksStorage } from "../services/storage/lorebooks.storage.js";
import { resolveChatUserIdentity } from "../services/chat-user-identity.js";
import { scanForActivatedEntries } from "../services/lorebook/keyword-scanner.js";
import { applyTokenBudget } from "../services/lorebook/prompt-injector.js";
import { resolveLorebookScopeExclusions } from "../services/lorebook/game-lorebook-scope.js";
import { resolveLorebookTokenBudget } from "../services/generation/lorebook-generation-runtime.js";
import { resolveRoleplayChatSummary } from "../services/generation/roleplay-summary-retrieval.js";
import {
  buildDirectorContext,
  DIRECTOR_SCENE_MESSAGES,
  type DirectorLoreEntry,
  type DirectorSceneMessage,
} from "../services/generation/fork-director-context.js";
import { cardPromptText } from "../services/prompt/card-text.js";
import { createBondsStorage } from "../services/bonds/fork-bonds.js";
import { createBoardPinsStorage } from "../services/board/fork-board-pins.js";
import { bondsPromptBlock } from "../services/generation/fork-bonds-prompt.js";
import { boardPinsNoteLine } from "../services/generation/fork-board-prompt.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";
import { logDebugOverride, logger } from "../lib/logger.js";

const SYSTEM_PROMPT = `You are the Director: the person the writer talks to between takes about their roleplay.

This conversation is off the record. Nothing you say is ever shown in the story, and the characters never learn about it.

Your job is to help the writer work out what the next reply should do. Be brief, concrete and practical, like a writing partner who has read every card. Two or three sentences is usually plenty.

- Ground what you say in the character cards, the writer's own character, the lore in play, the story so far and what actually happened in the scene. Name the detail you are using.
- When the writer says a character acted wrong, say what that character would do instead and why their card supports it.
- Disagree when the cards or the scene do not support what the writer is asking for. Say so plainly, then offer what would work.
- Never write the roleplay reply itself, and never write dialogue or actions for anyone. You describe what should happen, you do not perform it.

Return only valid JSON in this exact shape, with nothing before or after it:
{"say": "what you are telling the writer", "note": "the direction for the next reply, or an empty string"}

The "note" is what the story's writer model will be told to do on the next reply. Keep it one or two plain sentences describing what happens and how it is played, with no names for the writer and no meta talk. Build it from everything agreed so far in this conversation, not just the last message. Leave it empty only while nothing has been decided yet.`;

const MAX_TURNS = 24;
const MAX_MESSAGE_CHARS = 1500;

function parseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** A message the user hid from the AI (its extra may still be stored as JSON text). */
function hiddenFromAI(extra: unknown): boolean {
  let value = extra;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return Boolean(value && typeof value === "object" && (value as { hiddenFromAI?: unknown }).hiddenFromAI === true);
}

export async function forkDirectorRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const characters = createCharactersStorage(app.db);
  const lorebooks = createLorebooksStorage(app.db);

  /** One off-record turn. The client keeps the conversation and sends it back each time. */
  app.post("/talk", async (req, reply) => {
    const body = (req.body ?? {}) as {
      chatId?: unknown;
      messages?: unknown;
      connectionId?: unknown;
      debugMode?: unknown;
      /** The note as it stands in the panel, which the writer may have edited by hand. */
      note?: unknown;
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

    const resolved = await resolveForkChatProvider(app.db, chat, body.connectionId);
    if (!resolved.ok) return reply.status(400).send({ error: resolved.error });

    // ── The scene: who is in it, who the writer plays, the lore it runs on, and what happened ──
    const chatMeta = parseRecord(chat.metadata);
    const characterIds = parseStringList(chat.characterIds);
    const cardRows = (await Promise.all(characterIds.slice(0, 6).map((id) => characters.getById(id)))).filter(
      (row): row is NonNullable<typeof row> => Boolean(row),
    );
    const cards = cardRows.map((row) => {
      const card = parseRecord(row.data) as { name?: unknown; description?: unknown; personality?: unknown };
      return {
        name: card.name,
        description: cardPromptText(String(card.description ?? "")),
        personality: cardPromptText(String(card.personality ?? "")),
      };
    });

    const identity = await resolveChatUserIdentity(characters, chat).catch(() => null);
    const persona = identity
      ? {
          name: identity.name,
          description: cardPromptText(identity.description),
          personality: cardPromptText(identity.personality),
        }
      : null;

    // Only the tail matters here, and a long roleplay should not be read whole on every turn.
    // Previews already drop system, hidden and command-only messages; a message the user hid from
    // the AI is dropped here too, so the Director sees what the writer model sees. A few extra are
    // read so the scene is still full when some of the tail is hidden.
    const recent = (await chats.listMessagePreviews(chatId, DIRECTOR_SCENE_MESSAGES * 2))
      .filter((message) => !hiddenFromAI(message.extra))
      .slice(-DIRECTOR_SCENE_MESSAGES);
    const scene: DirectorSceneMessage[] = recent.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    // The same lore the writer model is working from: the chat's own books, its characters' and
    // its persona's, scanned against the scene the Director is reading.
    const lore: DirectorLoreEntry[] = await (async () => {
      try {
        const exclusions = resolveLorebookScopeExclusions(chat.mode, chatMeta);
        const entries = (await lorebooks.listActiveEntries({
          activeLorebookIds: parseStringList(chatMeta.activeLorebookIds),
          characterIds: identity?.source === "character" ? [...characterIds, identity.id] : characterIds,
          personaId: identity?.source === "persona" ? identity.id : null,
          chatId,
          ...exclusions,
        })) as unknown as LorebookEntry[];
        if (entries.length === 0) return [];
        const activated = scanForActivatedEntries(
          scene.map((message) => ({ role: String(message.role ?? "user"), content: String(message.content ?? "") })),
          entries,
          {
            scanDepth: DIRECTOR_SCENE_MESSAGES,
            activeCharacterIds: characterIds,
            ignoreTiming: true,
          },
        );
        return applyTokenBudget(activated, resolveLorebookTokenBudget(chatMeta)).map((match) => ({
          name: match.entry.name,
          content: match.entry.content,
        }));
      } catch (err) {
        // Lore is context, not the point. The Director still has the cards and the scene.
        logger.warn(err, "Fork Director could not resolve lorebook entries for chat %s", chatId);
        return [];
      }
    })();

    // What the writer model is told about the relationships and the pinned pictures, so the
    // Director judges a reply against the same picture of things.
    const standing = [
      bondsPromptBlock(
        await createBondsStorage(app.db).listForChat(chatId),
        (characterId) => String(cards[cardRows.findIndex((row) => row.id === characterId)]?.name ?? ""),
        persona?.name ?? "",
      ),
      boardPinsNoteLine(
        await createBoardPinsStorage(app.db).listForPrompt(chatId, identity?.source === "persona" ? identity.id : null),
      ),
    ]
      .filter(Boolean)
      .join("\n\n");

    const context = buildDirectorContext({
      cards,
      persona,
      lore,
      summary: resolveRoleplayChatSummary(String(chat.mode ?? ""), chatMeta),
      scene,
      standing,
    });

    // The Director answers in JSON but its past answers come back as plain words, so without this it
    // never saw its own earlier notes, and a note the writer had edited was overwritten next time.
    const currentNote = typeof body.note === "string" ? body.note.trim().slice(0, MAX_MESSAGE_CHARS) : "";
    const noteBlock = currentNote
      ? `<current_note>\n${currentNote}\n</current_note>\nThis is the note as it stands now. The writer may have edited it by hand: keep their wording unless this conversation changes what should happen, and return it unchanged in "note" when nothing new is decided.`
      : "";
    const system = [SYSTEM_PROMPT, context, noteBlock].filter(Boolean).join("\n\n");
    const promptMessages = [{ role: "system" as const, content: system }, ...turns];
    logDebugOverride(
      body.debugMode === true || isDebugAgentsEnabled(),
      "[debug/fork-director] prompt for chat %s:\n%s",
      chatId,
      promptMessages.map((message) => `[${message.role}]\n${message.content}`).join("\n\n"),
    );
    let raw = "";
    try {
      const result = await resolved.provider.chatComplete(promptMessages, { model: resolved.model, temperature: 0.6 });
      raw = (result.content ?? "").trim();
    } catch (error) {
      logger.error(error, "[fork-director] The model could not answer");
      return reply.status(502).send({ error: error instanceof Error ? error.message : "The model could not answer" });
    }
    // A model that ignores the JSON shape still has something useful to say, so keep its words.
    let say = raw;
    let note = "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as { say?: unknown; note?: unknown };
        if (typeof parsed.note === "string") note = parsed.note.trim();
        if (typeof parsed.say === "string" && parsed.say.trim()) say = parsed.say.trim();
        // Valid JSON with only a note: show the note rather than a block of raw JSON.
        else if (note) say = note;
      } catch {
        // Keep the raw text.
      }
    }
    if (!say) return reply.status(502).send({ error: "The model returned an empty response" });
    return { say, note };
  });
}
