// Fork feature: reference board API (see FORK.md).
import type { FastifyInstance } from "fastify";
import { MAX_FORK_PIN_ALBUM, FORK_PLACE_LOOKS, type ForkPlaceLook } from "@marinara-engine/shared";
import {
  createBoardPinsStorage,
  MAX_BOARD_PINS_PER_SCOPE,
  pinImagePaths,
  type BoardScopeType,
} from "../services/board/fork-board-pins.js";
import {
  discardLorebookImage,
  LOREBOOK_IMAGE_MAX_BYTES,
  saveLorebookImage,
} from "../services/lorebook/lorebook-images.js";
import { logger, logDebugOverride } from "../lib/logger.js";
import { isDebugAgentsEnabled } from "../config/runtime-config.js";
import { createClosetStorage } from "../services/board/fork-closet.js";
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
  const closet = createClosetStorage(app.db);

  const readScope = (query: unknown): { scopeType: BoardScopeType; scopeId: string } | null => {
    const q = (query ?? {}) as { scopeType?: unknown; scopeId?: unknown };
    const scopeType: BoardScopeType | null =
      q.scopeType === "persona" || q.scopeType === "chat" || q.scopeType === "outfit" ? q.scopeType : null;
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
    const file = await req.file({ limits: { fields: 10, parts: 12, files: 1, fileSize: LOREBOOK_IMAGE_MAX_BYTES } });
    if (!file) return reply.status(400).send({ error: "No image uploaded" });
    const fields = file.fields as Record<string, { value?: unknown } | undefined>;
    const readField = (name: string) => {
      const value = fields[name]?.value;
      return typeof value === "string" ? value : "";
    };
    const scope = readScope({ scopeType: readField("scopeType"), scopeId: readField("scopeId") });
    if (!scope) return reply.status(400).send({ error: "scopeType and scopeId are required" });
    if (scope.scopeType === "outfit" && !(await closet.exists(scope.scopeId))) {
      return reply.status(404).send({ error: "Outfit not found" });
    }

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
      name: readField("name"),
      // A closet piece is never "in scene": that happens when an outfit is worn in a chat.
      inScene: scope.scopeType !== "outfit" && readField("inScene") !== "false",
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
      name?: unknown;
      details?: unknown;
    };
    const details =
      body.details && typeof body.details === "object" && !Array.isArray(body.details)
        ? (body.details as Record<string, unknown>)
        : undefined;
    // The album is changed only through its own routes, which own the pictures in it.
    if (details) delete details.album;
    const updated = await storage.update(req.params.id, {
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(details ? { details } : {}),
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
      {
        role: "user" as const,
        // A pin already filed as a place, thing, person or vibe keeps that unless the picture is clearly not one.
        content:
          pin.category === "wearing"
            ? "Label this picture."
            : `Label this picture. The board has it as a ${pin.category}; keep that category unless the picture is clearly something else.`,
        images: [image],
      },
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
    // The pictures go too: a pin is the only thing that ever points at them.
    for (const path of pinImagePaths(pin)) {
      await discardLorebookImage({ path, caption: "" }).catch((error) =>
        logger.warn(error, "[fork-board] Could not delete a pin image"),
      );
    }
    return { success: true };
  });

  /** One more picture of a place, for day, night, rain or none of them. */
  app.post<{ Params: { id: string } }>("/pins/:id/album", async (req, reply) => {
    const pin = await storage.getById(req.params.id);
    if (!pin) return reply.status(404).send({ error: "Pin not found" });
    if ((pin.details.album ?? []).length >= MAX_FORK_PIN_ALBUM) {
      return reply.status(400).send({ error: `An album holds at most ${MAX_FORK_PIN_ALBUM} pictures` });
    }
    const file = await req.file({ limits: { fields: 2, parts: 3, files: 1, fileSize: LOREBOOK_IMAGE_MAX_BYTES } });
    if (!file) return reply.status(400).send({ error: "No image uploaded" });
    const lookField = (file.fields as Record<string, { value?: unknown } | undefined>).look?.value;
    const look = FORK_PLACE_LOOKS.includes(lookField as ForkPlaceLook) ? (lookField as ForkPlaceLook) : "";
    let image;
    try {
      image = await saveLorebookImage(await file.toBuffer());
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : "Could not save that image" });
    }
    // A new picture for a look replaces the old one for that look, whose file then goes.
    const current = (await storage.getById(pin.id))?.details.album ?? [];
    const replaced = look ? current.filter((entry) => entry.look === look) : [];
    const album = [...current.filter((entry) => !look || entry.look !== look), { path: image.path, look }];
    const updated = await storage.update(pin.id, { details: { album } });
    for (const entry of replaced) {
      await discardLorebookImage({ path: entry.path, caption: "" }).catch(() => undefined);
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/pins/:id/album", async (req, reply) => {
    const path = typeof (req.query as { path?: unknown }).path === "string" ? (req.query as { path: string }).path : "";
    const pin = await storage.getById(req.params.id);
    if (!pin) return reply.status(404).send({ error: "Pin not found" });
    const album = pin.details.album ?? [];
    if (!album.some((entry) => entry.path === path)) return reply.status(404).send({ error: "Picture not found" });
    const updated = await storage.update(pin.id, { details: { album: album.filter((entry) => entry.path !== path) } });
    await discardLorebookImage({ path, caption: "" }).catch((error) =>
      logger.warn(error, "[fork-board] Could not delete an album picture"),
    );
    return updated;
  });
}
