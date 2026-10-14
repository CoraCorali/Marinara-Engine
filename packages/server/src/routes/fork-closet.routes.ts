// Fork feature: the closet API, saved outfits for any chat (see FORK.md).
import type { FastifyInstance } from "fastify";
import { createClosetStorage, MAX_CLOSET_OUTFITS } from "../services/board/fork-closet.js";

export async function forkClosetRoutes(app: FastifyInstance) {
  const closet = createClosetStorage(app.db);

  app.get("/outfits", async () => closet.list());

  /** A new outfit: empty (pictures are added through the board's pin upload) or from pins. */
  app.post("/outfits", async (req, reply) => {
    const body = (req.body ?? {}) as { name?: unknown; pinIds?: unknown };
    const pinIds = Array.isArray(body.pinIds)
      ? body.pinIds.filter((id): id is string => typeof id === "string").slice(0, 24)
      : [];
    const outfit = await closet.create(body.name, pinIds);
    if (!outfit) return reply.status(400).send({ error: `The closet holds at most ${MAX_CLOSET_OUTFITS} outfits` });
    return outfit;
  });

  app.patch<{ Params: { id: string } }>("/outfits/:id", async (req, reply) => {
    const outfit = await closet.rename(req.params.id, ((req.body ?? {}) as { name?: unknown }).name);
    if (!outfit) return reply.status(404).send({ error: "Outfit not found" });
    return outfit;
  });

  app.delete<{ Params: { id: string } }>("/outfits/:id", async (req, reply) => {
    if (!(await closet.exists(req.params.id))) return reply.status(404).send({ error: "Outfit not found" });
    await closet.remove(req.params.id);
    return { success: true };
  });

  /** Put an outfit on someone in a chat. */
  app.post<{ Params: { id: string } }>("/outfits/:id/wear", async (req, reply) => {
    const body = (req.body ?? {}) as { chatId?: unknown; who?: unknown };
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    const who = typeof body.who === "string" ? body.who.trim() : "";
    if (!chatId || !who) return reply.status(400).send({ error: "chatId and who are required" });
    if (!(await closet.exists(req.params.id))) return reply.status(404).send({ error: "Outfit not found" });
    const worn = await closet.wear(req.params.id, chatId, who);
    if (worn.length === 0) return reply.status(400).send({ error: "Nothing from that outfit could be put on" });
    return worn;
  });
}
