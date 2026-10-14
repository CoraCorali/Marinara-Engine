// Fork feature: the closet, saved outfits for any chat (see FORK.md).
//
// An outfit is a name plus its pieces. The pieces are ordinary board pins in their own scope
// ("outfit", the outfit's id), so they reuse the board's picture store, captions and Describe it.
// Pictures are copied whenever pieces move between a chat and the closet, never shared, because
// removing a pin deletes its picture: deleting a chat can never empty the closet, and the other way
// round.
import { FORK_WEAR_SLOTS, type ForkWearSlot } from "@marinara-engine/shared";
import { asc, eq } from "../../db/file-query.js";
import { fileTable, integer, text } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";
import { discardLorebookImage, readLorebookImageDataUrl, saveLorebookImage } from "../lorebook/lorebook-images.js";
import { logger } from "../../lib/logger.js";
import { createBoardPinsStorage, type BoardPin } from "./fork-board-pins.js";

export const MAX_CLOSET_OUTFITS = 120;
export const MAX_OUTFIT_NAME = 60;

export const closetOutfits = fileTable("fork_closet_outfits", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

type OutfitRow = { id: string; name: string; order: number; createdAt: string; updatedAt: string };

export type ClosetOutfit = { id: string; name: string; order: number; pieces: BoardPin[] };

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_OUTFIT_NAME) : "";
}

/** The whole outfit first, then what it replaces, then what sits on top, so worn pieces replace in order. */
function wearOrder(pieces: readonly BoardPin[]): BoardPin[] {
  const rank = (slot: ForkWearSlot | "") => (slot ? FORK_WEAR_SLOTS.indexOf(slot) : FORK_WEAR_SLOTS.length);
  return [...pieces].sort((left, right) => rank(left.slot) - rank(right.slot) || left.order - right.order);
}

/** A fresh copy of a pin's picture. Null when the picture is gone. */
async function copyPicture(imagePath: string): Promise<string | null> {
  const dataUrl = await readLorebookImageDataUrl(imagePath);
  if (!dataUrl) return null;
  const image = await saveLorebookImage(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  return image.path;
}

export function createClosetStorage(db: DB) {
  const pins = createBoardPinsStorage(db);

  async function getRow(id: string): Promise<OutfitRow | null> {
    const rows = (await db.select().from(closetOutfits).where(eq(closetOutfits.id, id))) as unknown as OutfitRow[];
    return rows[0] ?? null;
  }

  async function withPieces(row: OutfitRow): Promise<ClosetOutfit> {
    return { id: row.id, name: row.name, order: row.order, pieces: await pins.listForScope("outfit", row.id) };
  }

  return {
    async list(): Promise<ClosetOutfit[]> {
      const rows = (await db
        .select()
        .from(closetOutfits)
        .orderBy(asc(closetOutfits.order), asc(closetOutfits.createdAt))) as unknown as OutfitRow[];
      return Promise.all(rows.map(withPieces));
    },

    async get(id: string): Promise<ClosetOutfit | null> {
      const row = await getRow(id);
      return row ? withPieces(row) : null;
    },

    async exists(id: string): Promise<boolean> {
      return Boolean(await getRow(id));
    },

    /** A new outfit, empty or holding copies of the given pins. Null when the closet is full. */
    async create(name: unknown, fromPinIds: readonly string[] = []): Promise<ClosetOutfit | null> {
      const rows = (await db.select().from(closetOutfits)) as unknown as OutfitRow[];
      if (rows.length >= MAX_CLOSET_OUTFITS) return null;
      const timestamp = now();
      const row: OutfitRow = {
        id: newId(),
        name: cleanName(name) || "Outfit",
        order: rows.reduce((highest, entry) => Math.max(highest, entry.order + 1), 0),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(closetOutfits).values(row as never);
      for (const pinId of fromPinIds) {
        const pin = await pins.getById(pinId);
        if (!pin) continue;
        const imagePath = await copyPicture(pin.imagePath);
        if (!imagePath) continue;
        await pins.create({
          scopeType: "outfit",
          scopeId: row.id,
          imagePath,
          caption: pin.caption,
          category: "wearing",
          slot: pin.slot,
          shows: pin.shows,
          inScene: false,
        });
      }
      return withPieces(row);
    },

    async rename(id: string, name: unknown): Promise<ClosetOutfit | null> {
      const row = await getRow(id);
      const clean = cleanName(name);
      if (!row) return null;
      if (clean) {
        await db
          .update(closetOutfits)
          .set({ name: clean, updatedAt: now() } as never)
          .where(eq(closetOutfits.id, id));
      }
      return this.get(id);
    },

    /** The outfit, its pieces and their pictures. */
    async remove(id: string): Promise<void> {
      for (const path of await pins.removeScope("outfit", id)) {
        await discardLorebookImage({ path, caption: "" }).catch((error) =>
          logger.warn(error, "[fork-closet] Could not delete an outfit picture"),
        );
      }
      await db.delete(closetOutfits).where(eq(closetOutfits.id, id));
    },

    /**
     * Put an outfit on someone in a chat: each piece becomes an in-scene pin on that chat's board
     * (with its own picture), and the board's usual rule takes out whatever it replaces.
     */
    async wear(id: string, chatId: string, who: string): Promise<BoardPin[]> {
      const outfit = await this.get(id);
      if (!outfit || !chatId) return [];
      const worn: BoardPin[] = [];
      for (const piece of wearOrder(outfit.pieces)) {
        const imagePath = await copyPicture(piece.imagePath);
        if (!imagePath) continue;
        const pin = await pins.create({
          scopeType: "chat",
          scopeId: chatId,
          imagePath,
          caption: piece.caption,
          category: "wearing",
          who,
          slot: piece.slot,
          shows: piece.shows,
          inScene: true,
        });
        if (!pin) {
          // The board is full: the copy has nothing pointing at it.
          await discardLorebookImage({ path: imagePath, caption: "" }).catch(() => undefined);
          break;
        }
        worn.push(pin);
      }
      return worn;
    },
  };
}
