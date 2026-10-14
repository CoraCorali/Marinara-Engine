// Fork feature: the relationship tracker (see FORK.md).
//
// A bond between the persona and one character in one roleplay. The point of it is that bonds are
// not all the same shape: what matters about a love interest is not what matters about a sister or
// a rival, so each kind tracks its own two things rather than sharing one "affection" score.
//
// Where a romance stands is a rung on a ladder, not a kind of its own. "Boyfriend" and "husband"
// are the same bond further along, which is why there is one romantic kind and six rungs.
//
// The table registers itself through the store's registerTables, the same path capability packages
// use, so it needs no storage-format bump and an older Marinara simply ignores the file.
import { eq, asc } from "../../db/file-query.js";
import { fileTable, text, integer } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

export const BOND_KINDS = ["love", "family", "friend", "rival", "ex", "other"] as const;
export type BondKind = (typeof BOND_KINDS)[number];

/** How far a romance has got. Only the romantic kind has rungs; the rest have none. */
export const LOVE_STAGES = ["talking", "dating", "together", "living", "engaged", "married"] as const;
export type LoveStage = (typeof LOVE_STAGES)[number];

/** The two things each kind of bond actually tracks, and what to call them. */
export const BOND_METERS: Record<BondKind, readonly [string, string]> = {
  love: ["wanting", "patience"],
  family: ["closeness", "friction"],
  friend: ["closeness", "trust"],
  rival: ["respect", "hostility"],
  ex: ["unfinished", "bitterness"],
  other: ["closeness", "trust"],
};

export const MAX_BONDS_PER_CHAT = 24;
export const MAX_BOND_NOTE = 400;

export const bonds = fileTable("fork_bonds", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  /** The character this bond is with. */
  characterId: text("character_id").notNull(),
  /** A name to show when the character is not one of the chat's cards. */
  label: text("label").notNull().default(""),
  kind: text("kind").notNull().default("other"),
  /** A rung on the romantic ladder; empty for every other kind. */
  stage: text("stage").notNull().default(""),
  /** 0–100 each, meaning whatever this kind's two meters are called. */
  first: integer("first").notNull().default(50),
  second: integer("second").notNull().default(50),
  note: text("note").notNull().default(""),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type BondRow = {
  id: string;
  chatId: string;
  characterId: string;
  label: string;
  kind: string;
  stage: string;
  first: number;
  second: number;
  note: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type Bond = {
  id: string;
  chatId: string;
  characterId: string;
  label: string;
  kind: BondKind;
  stage: LoveStage | null;
  first: number;
  second: number;
  note: string;
  order: number;
};

export function normalizeKind(value: unknown): BondKind {
  return BOND_KINDS.includes(value as BondKind) ? (value as BondKind) : "other";
}

/** A rung only means something on a romance, so every other kind is given none. */
export function normalizeStage(kind: BondKind, value: unknown): LoveStage | null {
  if (kind !== "love") return null;
  return LOVE_STAGES.includes(value as LoveStage) ? (value as LoveStage) : "talking";
}

export function clampMeter(value: unknown, fallback = 50): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function toBond(row: BondRow): Bond {
  const kind = normalizeKind(row.kind);
  return {
    id: row.id,
    chatId: row.chatId,
    characterId: row.characterId,
    label: row.label ?? "",
    kind,
    stage: normalizeStage(kind, row.stage),
    first: clampMeter(row.first),
    second: clampMeter(row.second),
    note: row.note ?? "",
    order: row.order ?? 0,
  };
}

export function createBondsStorage(db: DB) {
  return {
    async listForChat(chatId: string): Promise<Bond[]> {
      if (!chatId) return [];
      const rows = (await db
        .select()
        .from(bonds)
        .where(eq(bonds.chatId, chatId))
        .orderBy(asc(bonds.order), asc(bonds.createdAt))) as unknown as BondRow[];
      return rows.map(toBond);
    },

    async getById(id: string): Promise<Bond | null> {
      const rows = (await db.select().from(bonds).where(eq(bonds.id, id))) as unknown as BondRow[];
      return rows[0] ? toBond(rows[0]) : null;
    },

    async create(input: {
      chatId: string;
      characterId: string;
      label?: string;
      kind?: unknown;
      stage?: unknown;
      first?: unknown;
      second?: unknown;
      note?: string;
    }): Promise<Bond | null> {
      const existing = await this.listForChat(input.chatId);
      if (existing.length >= MAX_BONDS_PER_CHAT) return null;
      // One bond per character per chat: a second one would just disagree with the first.
      const already = existing.find((bond) => bond.characterId === input.characterId);
      if (already) return already;
      const kind = normalizeKind(input.kind);
      const timestamp = now();
      const row: BondRow = {
        id: newId(),
        chatId: input.chatId,
        characterId: input.characterId,
        label: (input.label ?? "").slice(0, 120),
        kind,
        stage: normalizeStage(kind, input.stage) ?? "",
        first: clampMeter(input.first),
        second: clampMeter(input.second),
        note: (input.note ?? "").slice(0, MAX_BOND_NOTE),
        order: existing.length > 0 ? existing[existing.length - 1]!.order + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(bonds).values(row as never);
      return toBond(row);
    },

    async update(
      id: string,
      data: { label?: string; kind?: unknown; stage?: unknown; first?: unknown; second?: unknown; note?: string },
    ): Promise<Bond | null> {
      const current = await this.getById(id);
      if (!current) return null;
      const kind = data.kind !== undefined ? normalizeKind(data.kind) : current.kind;
      const fields: Record<string, unknown> = { updatedAt: now() };
      if (data.label !== undefined) fields.label = data.label.slice(0, 120);
      if (data.kind !== undefined) {
        fields.kind = kind;
        // Changing kind re-reads the rung: a romance keeps where it was, anything else loses it.
        fields.stage = normalizeStage(kind, data.stage !== undefined ? data.stage : current.stage) ?? "";
      } else if (data.stage !== undefined) {
        fields.stage = normalizeStage(kind, data.stage) ?? "";
      }
      if (data.first !== undefined) fields.first = clampMeter(data.first, current.first);
      if (data.second !== undefined) fields.second = clampMeter(data.second, current.second);
      if (data.note !== undefined) fields.note = data.note.slice(0, MAX_BOND_NOTE);
      await db
        .update(bonds)
        .set(fields as never)
        .where(eq(bonds.id, id));
      return this.getById(id);
    },

    async remove(id: string): Promise<void> {
      await db.delete(bonds).where(eq(bonds.id, id));
    },

    /** Every bond in a chat, so deleting the chat leaves nothing behind. */
    async removeChat(chatId: string): Promise<void> {
      for (const bond of await this.listForChat(chatId)) await this.remove(bond.id);
    },
  };
}
