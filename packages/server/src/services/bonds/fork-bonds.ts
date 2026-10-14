// Fork feature: the relationship tracker (see FORK.md).
//
// A bond between the persona and one character in one roleplay, told in words like a dating sim.
// A love interest follows Pura's route (a rung on a warm or cold ladder, a condition, a drift, then
// heart, trust, wants and the rest); every other kind of bond has its own ladder and its own fields,
// all defined once in the shared fork-bond-shapes.
//
// Where a romance stands (talking through married) is a status kept apart from the feelings, so a
// husband can still be Guarded and cooling.
//
// Each time a bond moves a rung or a status, a moment is kept, so a person's card can be scrolled
// back through the story of the two of them.
//
// Both tables register themselves through the store's registerTables, the same path capability
// packages use, so they need no storage-format bump and an older Marinara simply ignores the files.
import {
  FORK_BOND_SHAPES,
  defaultForkBondRung,
  normalizeForkBondCondition,
  normalizeForkBondDrift,
  normalizeForkBondKind,
  normalizeForkBondRung,
  normalizeForkLoveStatus,
  type ForkBondKind,
  type ForkLoveStatus,
} from "@marinara-engine/shared";
import { eq, asc } from "../../db/file-query.js";
import { fileTable, text, integer } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

export const MAX_BONDS_PER_CHAT = 24;
export const MAX_BOND_FIELD = 400;
export const MAX_BOND_ROUTE = 80;
export const MAX_MOMENTS_PER_BOND = 60;
export const MAX_MOMENT_TEXT = 300;

export const bonds = fileTable("fork_bonds", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  /** The character this bond is with. */
  characterId: text("character_id").notNull(),
  /** A name to show when the character is not one of the chat's cards. */
  label: text("label").notNull().default(""),
  kind: text("kind").notNull().default("other"),
  /** A romance's status (talking … married); empty for every other kind. */
  stage: text("stage").notNull().default(""),
  /** Where they stand on their kind's ladder, or a tangled state. */
  rung: text("rung").notNull().default(""),
  /** The shape of a romance's story ("🌱 Slow Burn"). */
  route: text("route").notNull().default(""),
  condition: text("condition").notNull().default(""),
  drift: text("drift").notNull().default(""),
  /** The kind's detail fields, as JSON. */
  details: text("details").notNull().default("{}"),
  // Left from the first version, which tracked two numbers and a note. Kept so old files still read.
  first: integer("first").notNull().default(50),
  second: integer("second").notNull().default(50),
  note: text("note").notNull().default(""),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const bondMoments = fileTable("fork_bond_moments", {
  id: text("id").primaryKey(),
  bondId: text("bond_id").notNull(),
  chatId: text("chat_id").notNull(),
  /** Rung or status before and after, e.g. "Close" and "Confidant". */
  from: text("from").notNull().default(""),
  to: text("to").notNull().default(""),
  /** What happened, in a line: the scene's turn, or what the user wrote. */
  text: text("text").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export type BondRow = {
  id: string;
  chatId: string;
  characterId: string;
  label: string;
  kind: string;
  stage: string;
  rung?: string;
  route?: string;
  condition?: string;
  drift?: string;
  details?: string;
  first?: number;
  second?: number;
  note?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type Bond = {
  id: string;
  chatId: string;
  characterId: string;
  label: string;
  kind: ForkBondKind;
  status: ForkLoveStatus | null;
  rung: string;
  route: string;
  condition: string;
  drift: string;
  fields: Record<string, string>;
  order: number;
};

export type BondMoment = {
  id: string;
  bondId: string;
  chatId: string;
  from: string;
  to: string;
  text: string;
  createdAt: string;
};

export type BondInput = {
  label?: string;
  kind?: unknown;
  status?: unknown;
  rung?: unknown;
  route?: unknown;
  condition?: unknown;
  drift?: unknown;
  /** Only the kind's own fields are kept. An empty string clears one. */
  fields?: Record<string, unknown>;
};

/** Keep only the fields this kind has, as trimmed text. */
export function cleanFields(kind: ForkBondKind, fields: unknown): Record<string, string> {
  const source = fields && typeof fields === "object" ? (fields as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const key of FORK_BOND_SHAPES[kind].fields) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, MAX_BOND_FIELD);
  }
  return out;
}

function parseDetails(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function toBond(row: BondRow): Bond {
  const kind = normalizeForkBondKind(row.kind);
  const fields = cleanFields(kind, parseDetails(row.details));
  // A bond from the first version carries only a note. It becomes the heart of the card (or the
  // first field the kind has) instead of disappearing.
  const legacyNote = (row.note ?? "").trim();
  if (Object.keys(fields).length === 0 && legacyNote) {
    const shape = FORK_BOND_SHAPES[kind];
    fields[shape.fields.includes("heart") ? "heart" : shape.fields[0]!] = legacyNote.slice(0, MAX_BOND_FIELD);
  }
  return {
    id: row.id,
    chatId: row.chatId,
    characterId: row.characterId,
    label: row.label ?? "",
    kind,
    status: normalizeForkLoveStatus(kind, row.stage),
    rung: normalizeForkBondRung(kind, row.rung) ?? defaultForkBondRung(kind),
    route: kind === "love" ? (row.route ?? "").slice(0, MAX_BOND_ROUTE) : "",
    condition: normalizeForkBondCondition(row.condition) ?? "",
    drift: normalizeForkBondDrift(row.drift) ?? "",
    fields,
    order: row.order ?? 0,
  };
}

function cleanRoute(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_BOND_ROUTE) : "";
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

    async create(input: { chatId: string; characterId: string } & BondInput): Promise<Bond | null> {
      const existing = await this.listForChat(input.chatId);
      if (existing.length >= MAX_BONDS_PER_CHAT) return null;
      // One bond per character per chat: a second one would just disagree with the first.
      const already = existing.find((bond) => bond.characterId === input.characterId);
      if (already) return already;
      const kind = normalizeForkBondKind(input.kind);
      const timestamp = now();
      const row: BondRow = {
        id: newId(),
        chatId: input.chatId,
        characterId: input.characterId,
        label: (input.label ?? "").slice(0, 120),
        kind,
        stage: normalizeForkLoveStatus(kind, input.status) ?? "",
        rung: normalizeForkBondRung(kind, input.rung) ?? defaultForkBondRung(kind),
        route: kind === "love" ? cleanRoute(input.route) : "",
        condition: normalizeForkBondCondition(input.condition) ?? "",
        drift: normalizeForkBondDrift(input.drift) ?? "",
        details: JSON.stringify(cleanFields(kind, input.fields)),
        first: 50,
        second: 50,
        note: "",
        order: existing.length > 0 ? existing[existing.length - 1]!.order + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(bonds).values(row as never);
      return toBond(row);
    },

    /**
     * Writes what is given and leaves the rest. A change of kind drops whatever the old kind had that
     * the new one does not (its rung, its status, its fields), so turning a romance into a friendship
     * and back starts the romance again at the bottom instead of quietly restoring it.
     */
    async update(id: string, data: BondInput): Promise<Bond | null> {
      const current = await this.getById(id);
      if (!current) return null;
      const kindChanged = data.kind !== undefined && normalizeForkBondKind(data.kind) !== current.kind;
      const kind = kindChanged ? normalizeForkBondKind(data.kind) : current.kind;
      const fields: Record<string, unknown> = { updatedAt: now() };
      if (data.label !== undefined) fields.label = data.label.slice(0, 120);
      if (kindChanged) {
        fields.kind = kind;
        fields.stage = normalizeForkLoveStatus(kind, data.status) ?? "";
        fields.rung = normalizeForkBondRung(kind, data.rung) ?? defaultForkBondRung(kind);
        fields.route = kind === "love" ? cleanRoute(data.route) : "";
        fields.details = JSON.stringify(cleanFields(kind, { ...current.fields, ...(data.fields ?? {}) }));
        fields.note = "";
      } else {
        if (data.status !== undefined) fields.stage = normalizeForkLoveStatus(kind, data.status) ?? "";
        if (data.rung !== undefined) {
          const rung = normalizeForkBondRung(kind, data.rung);
          if (rung) fields.rung = rung;
        }
        if (data.route !== undefined && kind === "love") fields.route = cleanRoute(data.route);
        if (data.fields !== undefined) {
          const merged: Record<string, unknown> = { ...current.fields, ...data.fields };
          fields.details = JSON.stringify(cleanFields(kind, merged));
          fields.note = "";
        }
      }
      if (data.condition !== undefined) fields.condition = normalizeForkBondCondition(data.condition) ?? "";
      if (data.drift !== undefined) fields.drift = normalizeForkBondDrift(data.drift) ?? "";
      await db
        .update(bonds)
        .set(fields as never)
        .where(eq(bonds.id, id));
      return this.getById(id);
    },

    async remove(id: string): Promise<void> {
      for (const moment of await this.listMoments(id))
        await db.delete(bondMoments).where(eq(bondMoments.id, moment.id));
      await db.delete(bonds).where(eq(bonds.id, id));
    },

    /** Every bond in a chat, so deleting the chat leaves nothing behind. */
    async removeChat(chatId: string): Promise<void> {
      for (const bond of await this.listForChat(chatId)) await this.remove(bond.id);
    },

    /** Oldest first, the order the story happened in. */
    async listMoments(bondId: string): Promise<BondMoment[]> {
      const rows = (await db
        .select()
        .from(bondMoments)
        .where(eq(bondMoments.bondId, bondId))
        .orderBy(asc(bondMoments.createdAt))) as unknown as BondMoment[];
      return rows;
    },

    async listMomentsForChat(chatId: string): Promise<BondMoment[]> {
      if (!chatId) return [];
      return (await db
        .select()
        .from(bondMoments)
        .where(eq(bondMoments.chatId, chatId))
        .orderBy(asc(bondMoments.createdAt))) as unknown as BondMoment[];
    },

    /** Keeps a moment, dropping the oldest once a bond has more than it can hold. */
    async addMoment(input: {
      bondId: string;
      chatId: string;
      from: string;
      to: string;
      text?: string;
      createdAt?: string;
    }) {
      const moment: BondMoment = {
        id: newId(),
        bondId: input.bondId,
        chatId: input.chatId,
        from: input.from.slice(0, 80),
        to: input.to.slice(0, 80),
        text: (input.text ?? "").trim().slice(0, MAX_MOMENT_TEXT),
        createdAt: input.createdAt ?? now(),
      };
      await db.insert(bondMoments).values(moment as never);
      const all = await this.listMoments(input.bondId);
      for (const old of all.slice(0, Math.max(0, all.length - MAX_MOMENTS_PER_BOND))) {
        await db.delete(bondMoments).where(eq(bondMoments.id, old.id));
      }
      return moment;
    },

    async updateMoment(id: string, text: string): Promise<BondMoment | null> {
      await db
        .update(bondMoments)
        .set({ text: text.trim().slice(0, MAX_MOMENT_TEXT) } as never)
        .where(eq(bondMoments.id, id));
      const rows = (await db.select().from(bondMoments).where(eq(bondMoments.id, id))) as unknown as BondMoment[];
      return rows[0] ?? null;
    },

    async removeMoment(id: string): Promise<void> {
      await db.delete(bondMoments).where(eq(bondMoments.id, id));
    },
  };
}

/** The rung and status a bond moved through, each a moment's "from → to". */
export function describeMoves(before: Bond, after: Bond): { from: string; to: string }[] {
  const moves: { from: string; to: string }[] = [];
  if (before.kind !== after.kind) return moves;
  if (before.rung !== after.rung) moves.push({ from: before.rung, to: after.rung });
  if (before.status !== after.status && after.status) moves.push({ from: before.status ?? "", to: after.status });
  return moves;
}

export type { ForkBondKind as BondKind, ForkLoveStatus as LoveStatus };
