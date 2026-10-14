// Fork feature: the closet (see FORK.md).
//
// A persona's wardrobe. Each piece is a picture with a label and a slot, and one piece per slot is
// worn at a time. What she is wearing rides along with every reply, as pictures and as a line of
// text, so an outfit stays put instead of drifting a paragraph later.
//
// The table registers itself through the store's registerTables, the same path capability packages
// use, so it needs no storage-format bump and an older Marinara simply ignores the file.
import { eq, asc } from "../../db/file-query.js";
import { fileTable, text, integer } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

export const CLOSET_SLOTS = ["dress", "top", "bottom", "outer", "shoes", "bag", "jewellery", "extra"] as const;
export type ClosetSlot = (typeof CLOSET_SLOTS)[number];

/**
 * Slots that cannot be worn together. A dress replaces a top and a bottom, and either of those
 * replaces the dress; everything else is independent.
 */
const EXCLUDES: Partial<Record<ClosetSlot, readonly ClosetSlot[]>> = {
  dress: ["top", "bottom"],
  top: ["dress"],
  bottom: ["dress"],
};

/** How many pieces one persona may own. Keeps the closet browsable and the picture store bounded. */
export const MAX_CLOSET_ITEMS_PER_PERSONA = 80;
export const MAX_CLOSET_LABEL = 120;

export const closetItems = fileTable("fork_closet_items", {
  id: text("id").primaryKey(),
  personaId: text("persona_id").notNull(),
  slot: text("slot").notNull(),
  imagePath: text("image_path").notNull(),
  label: text("label").notNull().default(""),
  /** "true" when this piece is the one she has on. */
  worn: text("worn").notNull().default("false"),
  /** "generated" when the picture came from the image model, "upload" when it was added by hand. */
  source: text("source").notNull().default("upload"),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type ClosetItemRow = {
  id: string;
  personaId: string;
  slot: string;
  imagePath: string;
  label: string;
  worn: string;
  source: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type ClosetItem = {
  id: string;
  personaId: string;
  slot: ClosetSlot;
  imagePath: string;
  label: string;
  worn: boolean;
  source: "generated" | "upload";
  order: number;
};

export function normalizeSlot(value: unknown): ClosetSlot {
  return CLOSET_SLOTS.includes(value as ClosetSlot) ? (value as ClosetSlot) : "extra";
}

export function toClosetItem(row: ClosetItemRow): ClosetItem {
  return {
    id: row.id,
    personaId: row.personaId,
    slot: normalizeSlot(row.slot),
    imagePath: row.imagePath,
    label: row.label ?? "",
    worn: row.worn === "true",
    source: row.source === "generated" ? "generated" : "upload",
    order: row.order ?? 0,
  };
}

/** The slots a new piece takes the place of: its own, plus any it cannot be worn beside. */
export function slotsReplacedBy(slot: ClosetSlot): ClosetSlot[] {
  return [slot, ...(EXCLUDES[slot] ?? [])];
}

export function createClosetStorage(db: DB) {
  return {
    async listForPersona(personaId: string): Promise<ClosetItem[]> {
      if (!personaId) return [];
      const rows = (await db
        .select()
        .from(closetItems)
        .where(eq(closetItems.personaId, personaId))
        .orderBy(asc(closetItems.order), asc(closetItems.createdAt))) as unknown as ClosetItemRow[];
      return rows.map(toClosetItem);
    },

    async getById(id: string): Promise<ClosetItem | null> {
      const rows = (await db.select().from(closetItems).where(eq(closetItems.id, id))) as unknown as ClosetItemRow[];
      return rows[0] ? toClosetItem(rows[0]) : null;
    },

    async create(input: {
      personaId: string;
      slot?: unknown;
      imagePath: string;
      label?: string;
      source?: "generated" | "upload";
      wear?: boolean;
    }): Promise<ClosetItem | null> {
      const existing = await this.listForPersona(input.personaId);
      if (existing.length >= MAX_CLOSET_ITEMS_PER_PERSONA) return null;
      const timestamp = now();
      const row: ClosetItemRow = {
        id: newId(),
        personaId: input.personaId,
        slot: normalizeSlot(input.slot),
        imagePath: input.imagePath,
        label: (input.label ?? "").slice(0, MAX_CLOSET_LABEL),
        worn: "false",
        source: input.source === "generated" ? "generated" : "upload",
        order: existing.length > 0 ? existing[existing.length - 1]!.order + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(closetItems).values(row as never);
      if (input.wear) return this.wear(row.id);
      return toClosetItem(row);
    },

    async update(id: string, data: { label?: string; slot?: unknown; order?: number }): Promise<ClosetItem | null> {
      const fields: Record<string, unknown> = { updatedAt: now() };
      if (data.label !== undefined) fields.label = data.label.slice(0, MAX_CLOSET_LABEL);
      if (data.slot !== undefined) fields.slot = normalizeSlot(data.slot);
      if (data.order !== undefined && Number.isFinite(data.order)) fields.order = Math.trunc(data.order);
      await db
        .update(closetItems)
        .set(fields as never)
        .where(eq(closetItems.id, id));
      return this.getById(id);
    },

    /** Put a piece on, taking off whatever it replaces. */
    async wear(id: string): Promise<ClosetItem | null> {
      const item = await this.getById(id);
      if (!item) return null;
      const replaced = new Set(slotsReplacedBy(item.slot));
      const wardrobe = await this.listForPersona(item.personaId);
      for (const other of wardrobe) {
        if (other.id !== id && other.worn && replaced.has(other.slot)) {
          await db
            .update(closetItems)
            .set({ worn: "false", updatedAt: now() } as never)
            .where(eq(closetItems.id, other.id));
        }
      }
      await db
        .update(closetItems)
        .set({ worn: "true", updatedAt: now() } as never)
        .where(eq(closetItems.id, id));
      return this.getById(id);
    },

    /** Take a piece off without removing it from the closet. */
    async takeOff(id: string): Promise<ClosetItem | null> {
      await db
        .update(closetItems)
        .set({ worn: "false", updatedAt: now() } as never)
        .where(eq(closetItems.id, id));
      return this.getById(id);
    },

    async remove(id: string): Promise<void> {
      await db.delete(closetItems).where(eq(closetItems.id, id));
    },

    /** Every piece a persona owns, with its picture, so deleting a persona leaves nothing behind. */
    async removePersona(personaId: string): Promise<string[]> {
      const owned = await this.listForPersona(personaId);
      for (const item of owned) await this.remove(item.id);
      return owned.map((item) => item.imagePath);
    },

    /** What she has on, in the order an outfit reads: the big pieces first, trinkets last. */
    async listWorn(personaId: string): Promise<ClosetItem[]> {
      const worn = (await this.listForPersona(personaId)).filter((item) => item.worn);
      const rank = new Map(CLOSET_SLOTS.map((slot, index) => [slot, index] as const));
      return worn.sort((a, b) => (rank.get(a.slot) ?? 99) - (rank.get(b.slot) ?? 99));
    },
  };
}
