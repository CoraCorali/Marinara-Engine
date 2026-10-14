// Fork feature: reference board (see FORK.md).
//
// A pin is a reference picture with a caption. Pins marked "in scene" are sent to the model with
// every reply, so an outfit or a room stays the same instead of drifting. Chat pins belong to one
// roleplay; persona pins (hair, jewellery, a wedding ring) follow a persona into every chat.
//
// The table registers itself through the store's registerTables, the same path capability packages
// use, so it needs no storage-format bump and an older Marinara simply ignores the file.
import { eq, asc } from "../../db/file-query.js";
import { fileTable, text, integer } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

export const BOARD_PIN_CATEGORIES = ["wearing", "place", "person", "thing", "vibe"] as const;
export type BoardPinCategory = (typeof BOARD_PIN_CATEGORIES)[number];

/** How many pins one scope may hold. Keeps a board browsable and its prompt cost predictable. */
export const MAX_BOARD_PINS_PER_SCOPE = 60;
export const MAX_BOARD_PIN_CAPTION = 300;

export const boardPins = fileTable("fork_board_pins", {
  id: text("id").primaryKey(),
  /** "chat" for this roleplay only, or "persona" to follow a persona everywhere. */
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id").notNull(),
  imagePath: text("image_path").notNull(),
  caption: text("caption").notNull().default(""),
  category: text("category").notNull().default("wearing"),
  /** "true" when the pin is sent with every reply. */
  inScene: text("in_scene").notNull().default("true"),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type BoardPinRow = {
  id: string;
  scopeType: string;
  scopeId: string;
  imagePath: string;
  caption: string;
  category: string;
  inScene: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardPin = {
  id: string;
  scopeType: "chat" | "persona";
  scopeId: string;
  imagePath: string;
  caption: string;
  category: BoardPinCategory;
  inScene: boolean;
  order: number;
  createdAt: string;
};

export function normalizeCategory(value: unknown): BoardPinCategory {
  return BOARD_PIN_CATEGORIES.includes(value as BoardPinCategory) ? (value as BoardPinCategory) : "wearing";
}

export function toBoardPin(row: BoardPinRow): BoardPin {
  return {
    id: row.id,
    scopeType: row.scopeType === "persona" ? "persona" : "chat",
    scopeId: row.scopeId,
    imagePath: row.imagePath,
    caption: row.caption ?? "",
    category: normalizeCategory(row.category),
    inScene: row.inScene !== "false",
    order: row.order ?? 0,
    createdAt: row.createdAt ?? "",
  };
}

export function createBoardPinsStorage(db: DB) {
  return {
    async listForScope(scopeType: "chat" | "persona", scopeId: string): Promise<BoardPin[]> {
      if (!scopeId) return [];
      const rows = (await db
        .select()
        .from(boardPins)
        .where(eq(boardPins.scopeId, scopeId))
        .orderBy(asc(boardPins.order), asc(boardPins.createdAt))) as unknown as BoardPinRow[];
      return rows.filter((row) => row.scopeType === scopeType).map(toBoardPin);
    },

    async getById(id: string): Promise<BoardPin | null> {
      const rows = (await db.select().from(boardPins).where(eq(boardPins.id, id))) as unknown as BoardPinRow[];
      return rows[0] ? toBoardPin(rows[0]) : null;
    },

    async create(input: {
      scopeType: "chat" | "persona";
      scopeId: string;
      imagePath: string;
      caption?: string;
      category?: unknown;
      inScene?: boolean;
    }): Promise<BoardPin | null> {
      const existing = await this.listForScope(input.scopeType, input.scopeId);
      if (existing.length >= MAX_BOARD_PINS_PER_SCOPE) return null;
      const timestamp = now();
      const row: BoardPinRow = {
        id: newId(),
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        imagePath: input.imagePath,
        caption: (input.caption ?? "").slice(0, MAX_BOARD_PIN_CAPTION),
        category: normalizeCategory(input.category),
        inScene: String(input.inScene ?? true),
        order: existing.length > 0 ? existing[existing.length - 1]!.order + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(boardPins).values(row as never);
      return toBoardPin(row);
    },

    async update(
      id: string,
      data: { caption?: string; category?: unknown; inScene?: boolean; order?: number },
    ): Promise<BoardPin | null> {
      const fields: Record<string, unknown> = { updatedAt: now() };
      if (data.caption !== undefined) fields.caption = data.caption.slice(0, MAX_BOARD_PIN_CAPTION);
      if (data.category !== undefined) fields.category = normalizeCategory(data.category);
      if (data.inScene !== undefined) fields.inScene = String(data.inScene);
      if (data.order !== undefined && Number.isFinite(data.order)) fields.order = Math.trunc(data.order);
      await db
        .update(boardPins)
        .set(fields as never)
        .where(eq(boardPins.id, id));
      return this.getById(id);
    },

    async remove(id: string): Promise<void> {
      await db.delete(boardPins).where(eq(boardPins.id, id));
    },

    /** Every pin for a scope, with its picture, so deleting a chat or persona leaves nothing behind. */
    async removeScope(scopeType: "chat" | "persona", scopeId: string): Promise<string[]> {
      const pins = await this.listForScope(scopeType, scopeId);
      for (const pin of pins) await this.remove(pin.id);
      return pins.map((pin) => pin.imagePath);
    },

    /** Pins a reply should carry: this chat's in-scene pins, then the persona's. */
    async listForPrompt(chatId: string, personaId: string | null): Promise<BoardPin[]> {
      const [chatPins, personaPins] = await Promise.all([
        this.listForScope("chat", chatId),
        personaId ? this.listForScope("persona", personaId) : Promise.resolve([]),
      ]);
      return [...personaPins, ...chatPins].filter((pin) => pin.inScene);
    },
  };
}
