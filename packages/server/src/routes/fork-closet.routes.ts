// Fork feature: the closet API (see FORK.md).
import type { FastifyInstance } from "fastify";
import { createClosetStorage, MAX_CLOSET_ITEMS_PER_PERSONA } from "../services/closet/fork-closet-items.js";
import {
  discardLorebookImage,
  LOREBOOK_IMAGE_MAX_BYTES,
  saveLorebookImage,
} from "../services/lorebook/lorebook-images.js";
import { logger } from "../lib/logger.js";

/**
 * Garment pictures reuse the lorebook reference-image store: same size and type limits, same
 * validated path pattern, same serving route. One picture store, one set of safety rules.
 */
export async function forkClosetRoutes(app: FastifyInstance) {
  const storage = createClosetStorage(app.db);

  const readPersonaId = (source: unknown): string => {
    const value = (source ?? {}) as { personaId?: unknown };
    return typeof value.personaId === "string" ? value.personaId.trim() : "";
  };

  /** Everything a persona owns, in closet order. */
  app.get("/items", async (req, reply) => {
    const personaId = readPersonaId(req.query);
    if (!personaId) return reply.status(400).send({ error: "personaId is required" });
    return storage.listForPersona(personaId);
  });

  /** Just what she has on, for the strip above the message box. */
  app.get("/worn", async (req, reply) => {
    const personaId = readPersonaId(req.query);
    if (!personaId) return reply.status(400).send({ error: "personaId is required" });
    return storage.listWorn(personaId);
  });

  /** Add a piece. Multipart so a phone can send straight from its gallery. */
  app.post("/items", async (req, reply) => {
    const file = await req.file({ limits: { fields: 8, parts: 10, files: 1, fileSize: LOREBOOK_IMAGE_MAX_BYTES } });
    if (!file) return reply.status(400).send({ error: "No image uploaded" });
    const fields = file.fields as Record<string, { value?: unknown } | undefined>;
    const readField = (name: string) => {
      const value = fields[name]?.value;
      return typeof value === "string" ? value : "";
    };
    const personaId = readField("personaId").trim();
    if (!personaId) return reply.status(400).send({ error: "personaId is required" });

    const buffer = await file.toBuffer();
    let image;
    try {
      image = await saveLorebookImage(buffer);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : "Could not save that image" });
    }
    const item = await storage.create({
      personaId,
      slot: readField("slot"),
      imagePath: image.path,
      label: readField("label"),
      source: "upload",
      wear: readField("wear") === "true",
    });
    if (!item) {
      // The closet is full, so the picture we just saved has nothing pointing at it.
      await discardLorebookImage(image).catch((error) =>
        logger.warn(error, "[fork-closet] Could not discard an unattached garment image"),
      );
      return reply.status(400).send({ error: `A closet holds at most ${MAX_CLOSET_ITEMS_PER_PERSONA} pieces` });
    }
    return item;
  });

  app.patch<{ Params: { id: string } }>("/items/:id", async (req, reply) => {
    const body = (req.body ?? {}) as { label?: unknown; slot?: unknown; order?: unknown };
    const updated = await storage.update(req.params.id, {
      ...(typeof body.label === "string" ? { label: body.label } : {}),
      ...(body.slot !== undefined ? { slot: body.slot } : {}),
      ...(typeof body.order === "number" ? { order: body.order } : {}),
    });
    if (!updated) return reply.status(404).send({ error: "Piece not found" });
    return updated;
  });

  /** Put a piece on. Whatever it cannot be worn beside comes off by itself. */
  app.post<{ Params: { id: string } }>("/items/:id/wear", async (req, reply) => {
    const worn = await storage.wear(req.params.id);
    if (!worn) return reply.status(404).send({ error: "Piece not found" });
    return storage.listWorn(worn.personaId);
  });

  /** Take a piece off without giving it away. */
  app.post<{ Params: { id: string } }>("/items/:id/take-off", async (req, reply) => {
    const item = await storage.takeOff(req.params.id);
    if (!item) return reply.status(404).send({ error: "Piece not found" });
    return storage.listWorn(item.personaId);
  });

  app.delete<{ Params: { id: string } }>("/items/:id", async (req, reply) => {
    const item = await storage.getById(req.params.id);
    if (!item) return reply.status(404).send({ error: "Piece not found" });
    await storage.remove(item.id);
    // The picture goes too: a closet piece is the only thing that ever points at it.
    await discardLorebookImage({ path: item.imagePath, caption: "" }).catch((error) =>
      logger.warn(error, "[fork-closet] Could not delete a garment image"),
    );
    return { success: true };
  });
}
