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
import {
  buildAutoFixMessages,
  buildFixPartMessages,
  findAvoidedPhrases,
  isValidFixRange,
  readAutoFixReply,
  readFixPartReply,
  validAutoFixPassages,
  type AutoFixPassage,
} from "../services/generation/fork-fix-part.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";
import { logDebugOverride, logger } from "../lib/logger.js";
// Fork: Pocket Phone — a phone text can be fixed too.
import { createPhoneStorage, PHONE_PERSONA } from "../services/phone/fork-phone.js";
import { textItAnswered } from "../services/phone/fork-phone-texts.js";
import { clampPlainText } from "../services/generation/fork-director-context.js";

/** How much of each card a fix reads: enough to know who they are, not the whole card. */
const FIX_CARD_CHARS = 1500;

export async function forkFixRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const characters = createCharactersStorage(app.db);

  type ChatRow = NonNullable<Awaited<ReturnType<typeof chats.getById>>>;

  /** What a fix reads besides the reply: the turn it answered, who the writer plays, and the cards. */
  async function fixContext(chat: ChatRow, messageId: string | null) {
    // The writer's turn just before this reply, so the rewrite answers the same thing.
    const recent = messageId ? await chats.listMessagePreviews(chat.id, 30) : [];
    const index = recent.findIndex((row) => row.id === messageId);
    const previousTurn =
      index > 0 ? ([...recent.slice(0, index)].reverse().find((row) => row.role === "user")?.content ?? null) : null;
    const identity = await resolveChatUserIdentity(characters, chat).catch(() => null);
    // The cards in the chat, short, so "more in character" is judged against who they really are.
    const cardIds = (() => {
      try {
        const parsed = typeof chat.characterIds === "string" ? JSON.parse(chat.characterIds) : chat.characterIds;
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
      } catch {
        return [];
      }
    })();
    const cardTexts = (await Promise.all(cardIds.slice(0, 4).map((id) => characters.getById(id).catch(() => null))))
      .map((row) => {
        if (!row) return "";
        let card: { name?: unknown; personality?: unknown; description?: unknown } = {};
        try {
          card = typeof row.data === "string" ? JSON.parse(row.data) : ((row.data ?? {}) as typeof card);
        } catch {
          return "";
        }
        const name = clampPlainText(card.name, 120);
        const about =
          clampPlainText(card.personality, FIX_CARD_CHARS) || clampPlainText(card.description, FIX_CARD_CHARS);
        return name && about ? `${name}: ${about}` : "";
      })
      .filter(Boolean);
    return {
      previousTurn: typeof previousTurn === "string" ? previousTurn : null,
      writerName: identity?.name ?? null,
      cardTexts,
    };
  }

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
      phoneMessageId?: unknown;
      connectionId?: unknown;
    };
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    const phoneMessageId = typeof body.phoneMessageId === "string" ? body.phoneMessageId : "";
    const messageId = typeof body.messageId === "string" ? body.messageId : phoneMessageId;
    if (!chatId || !messageId) return reply.status(400).send({ error: "chatId and messageId are required" });

    const chat = await chats.getById(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    // Fork: the second target, a character's text on the phone: the whole text unless a part is picked.
    let content: string;
    let phoneAnswered: string | null = null;
    if (phoneMessageId) {
      const phones = createPhoneStorage(app.db);
      const text = await phones.getMessage(phoneMessageId);
      if (!text || text.chatId !== chatId) return reply.status(404).send({ error: "Text not found" });
      if (text.kind !== "text" || text.sender === PHONE_PERSONA) {
        return reply.status(400).send({ error: "Only their texts can be fixed; yours can be edited" });
      }
      content = text.body;
      const thread = (await phones.listMessages(chatId)).filter((entry) => entry.threadId === text.threadId);
      phoneAnswered = textItAnswered(text, thread);
    } else {
      const message = await chats.getMessage(messageId);
      if (!message || message.chatId !== chatId) return reply.status(404).send({ error: "Message not found" });
      if (message.role !== "assistant" && message.role !== "narrator") {
        return reply.status(400).send({ error: "Only a reply can be fixed this way" });
      }
      content = String(message.content ?? "");
    }
    const start = typeof body.start === "number" ? body.start : phoneMessageId ? 0 : -1;
    const end = typeof body.end === "number" ? body.end : phoneMessageId ? content.length : -1;
    if (!isValidFixRange(content, start, end))
      return reply.status(400).send({ error: "That passage is not in the reply" });
    // The reply may have changed since the passage was picked; never rewrite the wrong words.
    if (typeof body.expected === "string" && content.slice(start, end) !== body.expected) {
      return reply.status(409).send({ error: "The reply changed since you picked that passage" });
    }

    // Fixes can run on their own model (Slop settings); none picked is the chat's own.
    const resolved = await resolveForkChatProvider(app.db, chat, body.connectionId);
    if (!resolved.ok) return reply.status(400).send({ error: resolved.error });

    const { previousTurn: chatTurn, writerName, cardTexts } = await fixContext(chat, phoneMessageId ? null : messageId);
    const previousTurn = phoneAnswered ?? chatTurn;

    const messages = buildFixPartMessages({
      reply: content,
      start,
      end,
      instruction: typeof body.instruction === "string" ? body.instruction : null,
      avoid: Array.isArray(body.avoid) ? body.avoid.filter((item): item is string => typeof item === "string") : [],
      previousTurn: typeof previousTurn === "string" ? previousTurn : null,
      writerName,
      characters: cardTexts,
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
    let replacement = readFixPartReply(raw, content.slice(start, end));
    // The slop list is a hard rule: one more try, naming exactly what slipped through.
    const avoidList = Array.isArray(body.avoid)
      ? body.avoid.filter((item): item is string => typeof item === "string")
      : [];
    const slipped = findAvoidedPhrases(replacement, avoidList);
    if (replacement.trim() && slipped.length > 0) {
      try {
        const retry = await resolved.provider.chatComplete(
          [
            ...messages,
            { role: "assistant", content: replacement.trim() },
            {
              role: "user",
              content: `That still uses ${slipped.map((p) => `"${p}"`).join(", ")} from the slop list. Rewrite it again without those phrases, keeping every detail. Return only the passage.`,
            },
          ],
          { model: resolved.model, temperature: 0.8 },
        );
        const second = readFixPartReply(retry.content ?? "", content.slice(start, end));
        if (second.trim() && findAvoidedPhrases(second, avoidList).length < slipped.length) replacement = second;
      } catch (error) {
        logger.warn(error, "[fork-fix] Slop retry failed; keeping the first rewrite");
      }
    }
    if (!replacement.trim()) return reply.status(502).send({ error: "The model returned an empty rewrite" });
    return { replacement };
  });

  // Fork: the automatic slop pass. Every sentence of a finished reply that holds a slop-list phrase
  // is fixed in one call and handed back by number; like /part it saves nothing, the client splices
  // through the normal message edit so a reply that changed meanwhile is never overwritten.
  app.post("/auto", async (req, reply) => {
    const body = (req.body ?? {}) as {
      chatId?: unknown;
      messageId?: unknown;
      passages?: unknown;
      avoid?: unknown;
      connectionId?: unknown;
      debugMode?: unknown;
    };
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    if (!chatId || !messageId) return reply.status(400).send({ error: "chatId and messageId are required" });
    const chat = await chats.getById(chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    const message = await chats.getMessage(messageId);
    if (!message || message.chatId !== chatId) return reply.status(404).send({ error: "Message not found" });
    if (message.role !== "assistant" && message.role !== "narrator") {
      return reply.status(400).send({ error: "Only a reply can be fixed this way" });
    }
    const content = String(message.content ?? "");
    const rawPassages = Array.isArray(body.passages) ? body.passages.slice(0, 12) : [];
    const passages: Array<AutoFixPassage & { expected: string }> = rawPassages.map((entry) => {
      const item = (entry ?? {}) as { start?: unknown; end?: unknown; expected?: unknown; phrases?: unknown };
      return {
        start: typeof item.start === "number" ? item.start : -1,
        end: typeof item.end === "number" ? item.end : -1,
        expected: typeof item.expected === "string" ? item.expected : "",
        phrases: Array.isArray(item.phrases)
          ? item.phrases.filter((phrase): phrase is string => typeof phrase === "string").slice(0, 8)
          : [],
      };
    });
    if (!validAutoFixPassages(content, passages)) {
      return reply.status(400).send({ error: "Those passages are not in the reply" });
    }
    if (passages.some((passage) => content.slice(passage.start, passage.end) !== passage.expected)) {
      return reply.status(409).send({ error: "The reply changed since it was checked" });
    }

    const resolved = await resolveForkChatProvider(app.db, chat, body.connectionId);
    if (!resolved.ok) return reply.status(400).send({ error: resolved.error });
    const { previousTurn, writerName, cardTexts } = await fixContext(chat, messageId);
    const avoid = Array.isArray(body.avoid)
      ? body.avoid.filter((item): item is string => typeof item === "string")
      : [];
    const originals = passages.map((passage) => passage.expected);
    const messages = buildAutoFixMessages({
      reply: content,
      passages,
      avoid,
      previousTurn,
      writerName,
      characters: cardTexts,
    });
    logDebugOverride(
      body.debugMode === true || isDebugAgentsEnabled(),
      "[debug/fork-fix] automatic prompt for message %s:\n%s",
      messageId,
      messages.map((entry) => `[${entry.role}]\n${entry.content}`).join("\n\n"),
    );

    let replacements: Array<string | null>;
    try {
      const result = await resolved.provider.chatComplete(messages, { model: resolved.model, temperature: 0.8 });
      replacements = readAutoFixReply(result.content ?? "", originals);
    } catch (error) {
      logger.error(error, "[fork-fix] The model could not run the automatic pass");
      return reply.status(502).send({ error: error instanceof Error ? error.message : "The automatic fix failed" });
    }
    // One more try for sentences that still carry a listed phrase, naming exactly what slipped through.
    const slipped = replacements.map((text) => (text ? findAvoidedPhrases(text, avoid) : []));
    if (slipped.some((hits) => hits.length > 0)) {
      try {
        const notes = slipped
          .map((hits, index) => (hits.length > 0 ? `${index + 1}: ${hits.map((p) => `"${p}"`).join(", ")}` : ""))
          .filter(Boolean);
        const retry = await resolved.provider.chatComplete(
          [
            ...messages,
            {
              role: "assistant",
              content: replacements
                .map((text, index) => `<fix n="${index + 1}">${(text ?? originals[index]!).trim()}</fix>`)
                .join("\n"),
            },
            {
              role: "user",
              content: `Some of those still use phrases from the slop list:\n${notes.join("\n")}\nReturn every <fix> again, rewriting those without the phrases and keeping every detail.`,
            },
          ],
          { model: resolved.model, temperature: 0.8 },
        );
        const second = readAutoFixReply(retry.content ?? "", originals);
        replacements = replacements.map((first, index) => {
          const again = second[index];
          if (!again || slipped[index]!.length === 0) return first;
          return findAvoidedPhrases(again, avoid).length < slipped[index]!.length ? again : first;
        });
      } catch (error) {
        logger.warn(error, "[fork-fix] Automatic slop retry failed; keeping the first rewrites");
      }
    }
    return {
      replacements: passages.map((passage, index) => ({
        start: passage.start,
        end: passage.end,
        replacement: replacements[index] ?? null,
      })),
    };
  });
}
