// Fork feature: the relationship tracker API (see FORK.md).
import type { FastifyInstance } from "fastify";
import { createBondsStorage, MAX_BONDS_PER_CHAT } from "../services/bonds/fork-bonds.js";

export async function forkBondsRoutes(app: FastifyInstance) {
  const storage = createBondsStorage(app.db);

  /** Every bond in one roleplay. */
  app.get("/bonds", async (req, reply) => {
    const query = (req.query ?? {}) as { chatId?: unknown };
    const chatId = typeof query.chatId === "string" ? query.chatId.trim() : "";
    if (!chatId) return reply.status(400).send({ error: "chatId is required" });
    return storage.listForChat(chatId);
  });

  app.post("/bonds", async (req, reply) => {
    const body = (req.body ?? {}) as {
      chatId?: unknown;
      characterId?: unknown;
      label?: unknown;
      kind?: unknown;
      stage?: unknown;
      first?: unknown;
      second?: unknown;
      note?: unknown;
    };
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    const characterId = typeof body.characterId === "string" ? body.characterId.trim() : "";
    if (!chatId || !characterId) return reply.status(400).send({ error: "chatId and characterId are required" });
    const bond = await storage.create({
      chatId,
      characterId,
      label: typeof body.label === "string" ? body.label : "",
      kind: body.kind,
      stage: body.stage,
      first: body.first,
      second: body.second,
      note: typeof body.note === "string" ? body.note : "",
    });
    if (!bond) return reply.status(400).send({ error: `A chat tracks at most ${MAX_BONDS_PER_CHAT} bonds` });
    return bond;
  });

  app.patch<{ Params: { id: string } }>("/bonds/:id", async (req, reply) => {
    const body = (req.body ?? {}) as {
      label?: unknown;
      kind?: unknown;
      stage?: unknown;
      first?: unknown;
      second?: unknown;
      note?: unknown;
    };
    const updated = await storage.update(req.params.id, {
      ...(typeof body.label === "string" ? { label: body.label } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.stage !== undefined ? { stage: body.stage } : {}),
      ...(body.first !== undefined ? { first: body.first } : {}),
      ...(body.second !== undefined ? { second: body.second } : {}),
      ...(typeof body.note === "string" ? { note: body.note } : {}),
    });
    if (!updated) return reply.status(404).send({ error: "Bond not found" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/bonds/:id", async (req, reply) => {
    const bond = await storage.getById(req.params.id);
    if (!bond) return reply.status(404).send({ error: "Bond not found" });
    await storage.remove(bond.id);
    return { success: true };
  });
}
