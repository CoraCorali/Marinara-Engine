// Fork feature: reference board API (see FORK.md).
import type { FastifyInstance } from "fastify";
import { createBoardPinsStorage, MAX_BOARD_PINS_PER_SCOPE } from "../services/board/fork-board-pins.js";
import {
  discardLorebookImage,
  LOREBOOK_IMAGE_MAX_BYTES,
  saveLorebookImage,
} from "../services/lorebook/lorebook-images.js";
import { logger } from "../lib/logger.js";

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
    const body = (req.body ?? {}) as { caption?: unknown; category?: unknown; inScene?: unknown; order?: unknown };
    const updated = await storage.update(req.params.id, {
      ...(typeof body.caption === "string" ? { caption: body.caption } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(typeof body.inScene === "boolean" ? { inScene: body.inScene } : {}),
      ...(typeof body.order === "number" ? { order: body.order } : {}),
    });
    if (!updated) return reply.status(404).send({ error: "Pin not found" });
    return updated;
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
