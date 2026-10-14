// Fork feature: reference board API (see FORK.md).
import type { FastifyInstance } from "fastify";
import { createBoardPinsStorage, MAX_BOARD_PINS_PER_SCOPE } from "../services/board/fork-board-pins.js";
import {
  discardLorebookImage,
  LOREBOOK_IMAGE_MAX_BYTES,
  saveLorebookImage,
} from "../services/lorebook/lorebook-images.js";
import { logger, logDebugOverride } from "../lib/logger.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { resolveForkChatProvider } from "../services/generation/fork-chat-provider.js";
import { readLorebookImageDataUrl } from "../services/lorebook/lorebook-images.js";
import { PIN_DESCRIBE_PROMPT, readPinDescription } from "../services/generation/fork-pin-describe.js";

/**
 * Pin pictures reuse the lorebook reference-image store: same size and type limits, same
 * validated path pattern, same serving route. One picture store, one set of safety rules.
 */
export async function forkBoardRoutes(app: FastifyInstance) {
  const storage = createBoardPinsStorage(app.db);

  const readScope = (query: unknown): { scopeType: "chat" | "persona"; scopeId: string } | null => {
    const q = (query ?? {}) as { scopeType?: unknown; scopeId?: unknown };
    const scopeType: "chat" | "persona" | null =
      q.scopeType === "persona" ? "persona" : q.scopeType === "chat" ? "chat" : null;
    const scopeId = typeof q.scopeId === "string" ? q.scopeId.trim() : "";
    return scopeType && scopeId ? { scopeType, scopeId } : null;
  };

  /** Every pin for one chat or persona, newest ordering last. */
  app.get("/pins", async (req, reply) => {
    const scope = readScope(req.query);
    if (!scope) return reply.status(400).send({ error: "scopeType and scopeId are required" });
    return storage.listForScope(scope.scopeType, scope.scopeId);
  });

  /** Upload a picture and pin it. Multipart so a phone can send straight from its gallery. */
  app.post("/pins", async (req, reply) => {
    const file = await req.file({ limits: { fields: 8, parts: 10, files: 1, fileSize: LOREBOOK_IMAGE_MAX_BYTES } });
    if (!file) return reply.status(400).send({ error: "No image uploaded" });
    const fields = file.fields as Record<string, { value?: unknown } | undefined>;
    const readField = (name: string) => {
      const value = fields[name]?.value;
      return typeof value === "string" ? value : "";
    };
    const scope = readScope({ scopeType: readField("scopeType"), scopeId: readField("scopeId") });
    if (!scope) return reply.status(400).send({ error: "scopeType and scopeId are required" });

    const buffer = await file.toBuffer();
    let image;
    try {
      image = await saveLorebookImage(buffer);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : "Could not save that image" });
    }
    const pin = await storage.create({
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      imagePath: image.path,
      caption: readField("caption"),
      category: readField("category"),
      who: readField("who"),
      slot: readField("slot"),
      shows: readField("shows"),
      inScene: readField("inScene") !== "false",
    });
    if (!pin) {
      // The board is full, so the picture we just saved has nothing pointing at it.
      await discardLorebookImage(image).catch((error) =>
        logger.warn(error, "[fork-board] Could not discard an unattached pin image"),
      );
      return reply.status(400).send({ error: `A board holds at most ${MAX_BOARD_PINS_PER_SCOPE} pins` });
    }
    return pin;
  });

  app.patch<{ Params: { id: string } }>("/pins/:id", async (req, reply) => {
    const body = (req.body ?? {}) as {
      caption?: unknown;
      category?: unknown;
      inScene?: unknown;
      order?: unknown;
      who?: unknown;
      slot?: unknown;
      shows?: unknown;
    };
    const updated = await storage.update(req.params.id, {
      ...(typeof body.caption === "string" ? { caption: body.caption } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(typeof body.inScene === "boolean" ? { inScene: body.inScene } : {}),
      ...(typeof body.order === "number" ? { order: body.order } : {}),
      ...(typeof body.who === "string" ? { who: body.who } : {}),
      ...(typeof body.slot === "string" ? { slot: body.slot } : {}),
      ...(typeof body.shows === "string" ? { shows: body.shows } : {}),
    });
    if (!updated) return reply.status(404).send({ error: "Pin not found" });
    return updated;
  });

  /**
   * "Describe it": the chat's own model looks at the picture and suggests a caption, a category, a
   * slot and whether anyone is wearing it. Returns the suggestion; the board decides what to keep.
   */
  app.post<{ Params: { id: string } }>("/pins/:id/describe", async (req, reply) => {
    const body = (req.body ?? {}) as { chatId?: unknown; debugMode?: unknown };
    const pin = await storage.getById(req.params.id);
    if (!pin) return reply.status(404).send({ error: "Pin not found" });
    const chatId = pin.scopeType === "chat" ? pin.scopeId : typeof body.chatId === "string" ? body.chatId : "";
    const chat = chatId ? await createChatsStorage(app.db).getById(chatId) : null;
    if (!chat) return reply.status(400).send({ error: "Open a chat to describe this picture with its model" });
    const resolved = await resolveForkChatProvider(app.db, chat);
    if (!resolved.ok) return reply.status(400).send({ error: resolved.error });
    const image = await readLorebookImageDataUrl(pin.imagePath);
    if (!image) return reply.status(404).send({ error: "The picture is missing" });

    const messages = [
      { role: "system" as const, content: PIN_DESCRIBE_PROMPT },
      { role: "user" as const, content: "Label this picture.", images: [image] },
    ];
    logDebugOverride(
      body.debugMode === true || isDebugAgentsEnabled(),
      "[debug/fork-board] describe prompt for pin %s:\n%s",
      pin.id,
      PIN_DESCRIBE_PROMPT,
    );
    let raw = "";
    try {
      const result = await resolved.provider.chatComplete(messages as never, {
        model: resolved.model,
        temperature: 0.2,
        maxTokens: 400,
      });
      raw = (result.content ?? "").trim();
    } catch (error) {
      logger.error(error, "[fork-board] The model could not describe pin %s", pin.id);
      return reply.status(502).send({ error: error instanceof Error ? error.message : "The model could not answer" });
    }
    const description = readPinDescription(raw);
    if (!description) {
      return reply.status(502).send({ error: "The model did not describe the picture. Its model may not see images." });
    }
    return description;
  });

  app.delete<{ Params: { id: string } }>("/pins/:id", async (req, reply) => {
    const pin = await storage.getById(req.params.id);
    if (!pin) return reply.status(404).send({ error: "Pin not found" });
    await storage.remove(pin.id);
    // The picture goes too: a pin is the only thing that ever points at it.
    await discardLorebookImage({ path: pin.imagePath, caption: "" }).catch((error) =>
      logger.warn(error, "[fork-board] Could not delete a pin image"),
    );
    return { success: true };
  });
}
