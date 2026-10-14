// Fork feature: the relationship tracker API (see FORK.md).
import type { FastifyInstance } from "fastify";
import { MAX_BONDS_PER_CHAT, createBondsStorage, describeMoves, type BondInput } from "../services/bonds/fork-bonds.js";
import { listRecentBondChanges, recentReplyIds } from "../services/bonds/fork-bond-recent.js";
import { MAX_PAIRS_PER_CHAT, createBondPairsStorage, type BondPairInput } from "../services/bonds/fork-bond-pairs.js";

/** The parts of a request body a pair may be written from. */
function readPairInput(body: Record<string, unknown>): BondPairInput {
  return {
    ...(body.kind !== undefined ? { kind: body.kind } : {}),
    ...(body.rung !== undefined ? { rung: body.rung } : {}),
    ...(typeof body.aLine === "string" ? { aLine: body.aLine } : {}),
    ...(typeof body.bLine === "string" ? { bLine: body.bLine } : {}),
  };
}

/** The parts of a request body a bond may be written from. */
function readBondInput(body: Record<string, unknown>): BondInput {
  return {
    ...(typeof body.label === "string" ? { label: body.label } : {}),
    ...(body.kind !== undefined ? { kind: body.kind } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.rung !== undefined ? { rung: body.rung } : {}),
    ...(body.route !== undefined ? { route: body.route } : {}),
    ...(body.condition !== undefined ? { condition: body.condition } : {}),
    ...(body.drift !== undefined ? { drift: body.drift } : {}),
    ...(body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
      ? { fields: body.fields as Record<string, unknown> }
      : {}),
  };
}

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
    const body = (req.body ?? {}) as Record<string, unknown>;
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    const characterId = typeof body.characterId === "string" ? body.characterId.trim() : "";
    if (!chatId || !characterId) return reply.status(400).send({ error: "chatId and characterId are required" });
    const bond = await storage.create({ chatId, characterId, ...readBondInput(body) });
    if (!bond) return reply.status(400).send({ error: `A chat tracks at most ${MAX_BONDS_PER_CHAT} bonds` });
    return bond;
  });

  app.patch<{ Params: { id: string } }>("/bonds/:id", async (req, reply) => {
    const before = await storage.getById(req.params.id);
    if (!before) return reply.status(404).send({ error: "Bond not found" });
    const updated = await storage.update(before.id, readBondInput((req.body ?? {}) as Record<string, unknown>));
    if (!updated) return reply.status(404).send({ error: "Bond not found" });
    // Moving someone by hand is part of the story too, so it is kept as a moment the user can caption.
    for (const move of describeMoves(before, updated)) {
      await storage.addMoment({ bondId: updated.id, chatId: updated.chatId, ...move });
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/bonds/:id", async (req, reply) => {
    const bond = await storage.getById(req.params.id);
    if (!bond) return reply.status(404).send({ error: "Bond not found" });
    await storage.remove(bond.id);
    return { success: true };
  });

  /** What moved lately, for the Relationships list's "last changed" chips. */
  app.get("/recent", async (req, reply) => {
    const query = (req.query ?? {}) as { chatId?: unknown };
    const chatId = typeof query.chatId === "string" ? query.chatId.trim() : "";
    if (!chatId) return reply.status(400).send({ error: "chatId is required" });
    return listRecentBondChanges(app.db, chatId, await recentReplyIds(app.db, chatId));
  });

  // ── Pairs: how two characters stand with each other ──
  const pairs = createBondPairsStorage(app.db);

  app.get("/pairs", async (req, reply) => {
    const query = (req.query ?? {}) as { chatId?: unknown };
    const chatId = typeof query.chatId === "string" ? query.chatId.trim() : "";
    if (!chatId) return reply.status(400).send({ error: "chatId is required" });
    return pairs.listForChat(chatId);
  });

  app.post("/pairs", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    const firstId = typeof body.firstId === "string" ? body.firstId.trim() : "";
    const secondId = typeof body.secondId === "string" ? body.secondId.trim() : "";
    if (!chatId || !firstId || !secondId || firstId === secondId) {
      return reply.status(400).send({ error: "chatId and two different characters are required" });
    }
    const pair = await pairs.create({ chatId, firstId, secondId, ...readPairInput(body) });
    if (!pair) return reply.status(400).send({ error: `A chat tracks at most ${MAX_PAIRS_PER_CHAT} pairs` });
    return pair;
  });

  app.patch<{ Params: { id: string } }>("/pairs/:id", async (req, reply) => {
    const updated = await pairs.update(req.params.id, readPairInput((req.body ?? {}) as Record<string, unknown>));
    if (!updated) return reply.status(404).send({ error: "Pair not found" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/pairs/:id", async (req, reply) => {
    if (!(await pairs.getById(req.params.id))) return reply.status(404).send({ error: "Pair not found" });
    await pairs.remove(req.params.id);
    return { success: true };
  });

  /** Every moment in one roleplay, oldest first, for the cards' timelines. */
  app.get("/moments", async (req, reply) => {
    const query = (req.query ?? {}) as { chatId?: unknown };
    const chatId = typeof query.chatId === "string" ? query.chatId.trim() : "";
    if (!chatId) return reply.status(400).send({ error: "chatId is required" });
    return storage.listMomentsForChat(chatId);
  });

  app.patch<{ Params: { id: string } }>("/moments/:id", async (req, reply) => {
    const body = (req.body ?? {}) as { text?: unknown };
    if (typeof body.text !== "string") return reply.status(400).send({ error: "text is required" });
    const moment = await storage.updateMoment(req.params.id, body.text);
    if (!moment) return reply.status(404).send({ error: "Moment not found" });
    return moment;
  });

  app.delete<{ Params: { id: string } }>("/moments/:id", async (req) => {
    await storage.removeMoment(req.params.id);
    return { success: true };
  });
}
