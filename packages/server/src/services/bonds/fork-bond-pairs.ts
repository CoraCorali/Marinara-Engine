// Fork feature: bonds between two characters (see FORK.md).
//
// The relationship tracker follows each character's bond with the persona; a pair is how two
// characters stand with each other (Vee and his mother Gia, Vee and his best friend Dee). One
// record per pair holds what they share (the kind and a rung on that kind's ladder), and each side
// gets its own short line, because feelings are not always mutual.
import {
  FORK_BOND_SHAPES,
  defaultForkBondRung,
  normalizeForkBondKind,
  normalizeForkBondRung,
  readForkBondKind,
  stepForkBondRung,
  type ForkBondKind,
} from "@marinara-engine/shared";
import { and, asc, eq } from "../../db/file-query.js";
import { fileTable, integer, text } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

export const MAX_PAIRS_PER_CHAT = 24;
export const MAX_PAIR_LINE = 240;

export const bondPairs = fileTable("fork_bond_pairs", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  /** The two characters, by id. Stored in a fixed order so a pair is never kept twice. */
  aId: text("a_id").notNull(),
  bId: text("b_id").notNull(),
  kind: text("kind").notNull().default("other"),
  rung: text("rung").notNull().default(""),
  /** How A is with B, and how B is with A, each in a line. */
  aLine: text("a_line").notNull().default(""),
  bLine: text("b_line").notNull().default(""),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type BondPairRow = {
  id: string;
  chatId: string;
  aId: string;
  bId: string;
  kind: string;
  rung: string;
  aLine: string;
  bLine: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type BondPair = {
  id: string;
  chatId: string;
  aId: string;
  bId: string;
  kind: ForkBondKind;
  rung: string;
  aLine: string;
  bLine: string;
  order: number;
};

export type BondPairInput = {
  kind?: unknown;
  rung?: unknown;
  aLine?: unknown;
  bLine?: unknown;
};

function cleanLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_PAIR_LINE) : "";
}

export function toBondPair(row: BondPairRow): BondPair {
  const kind = normalizeForkBondKind(row.kind);
  return {
    id: row.id,
    chatId: row.chatId,
    aId: row.aId,
    bId: row.bId,
    kind,
    rung: normalizeForkBondRung(kind, row.rung) ?? defaultForkBondRung(kind),
    aLine: row.aLine ?? "",
    bLine: row.bLine ?? "",
    order: row.order ?? 0,
  };
}

/** The two ids in the order a pair is stored in, and whether they were swapped to get there. */
export function pairKey(first: string, second: string): { aId: string; bId: string; swapped: boolean } {
  return first <= second ? { aId: first, bId: second, swapped: false } : { aId: second, bId: first, swapped: true };
}

export function createBondPairsStorage(db: DB) {
  return {
    async listForChat(chatId: string): Promise<BondPair[]> {
      if (!chatId) return [];
      const rows = (await db
        .select()
        .from(bondPairs)
        .where(eq(bondPairs.chatId, chatId))
        .orderBy(asc(bondPairs.order), asc(bondPairs.createdAt))) as unknown as BondPairRow[];
      return rows.map(toBondPair);
    },

    async getById(id: string): Promise<BondPair | null> {
      const rows = (await db.select().from(bondPairs).where(eq(bondPairs.id, id))) as unknown as BondPairRow[];
      return rows[0] ? toBondPair(rows[0]) : null;
    },

    /** One pair per two characters per chat. Returns the existing pair when it is already kept. */
    async create(
      input: { chatId: string; firstId: string; secondId: string } & BondPairInput,
    ): Promise<BondPair | null> {
      if (!input.firstId || !input.secondId || input.firstId === input.secondId) return null;
      const { aId, bId, swapped } = pairKey(input.firstId, input.secondId);
      const existing = await this.listForChat(input.chatId);
      const same = existing.find((pair) => pair.aId === aId && pair.bId === bId);
      if (same) return same;
      if (existing.length >= MAX_PAIRS_PER_CHAT) return null;
      const kind = normalizeForkBondKind(input.kind);
      const timestamp = now();
      const row: BondPairRow = {
        id: newId(),
        chatId: input.chatId,
        aId,
        bId,
        kind,
        rung: normalizeForkBondRung(kind, input.rung) ?? defaultForkBondRung(kind),
        aLine: cleanLine(swapped ? input.bLine : input.aLine),
        bLine: cleanLine(swapped ? input.aLine : input.bLine),
        order: existing.length > 0 ? existing[existing.length - 1]!.order + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(bondPairs).values(row as never);
      return toBondPair(row);
    },

    /** Writes what is given. A change of kind starts the new kind's ladder at its first rung. */
    async update(id: string, data: BondPairInput): Promise<BondPair | null> {
      const current = await this.getById(id);
      if (!current) return null;
      const fields: Record<string, unknown> = { updatedAt: now() };
      const kind = data.kind !== undefined ? normalizeForkBondKind(data.kind) : current.kind;
      if (kind !== current.kind) {
        fields.kind = kind;
        fields.rung = normalizeForkBondRung(kind, data.rung) ?? defaultForkBondRung(kind);
      } else if (data.rung !== undefined) {
        const rung = normalizeForkBondRung(kind, data.rung);
        if (rung) fields.rung = rung;
      }
      if (data.aLine !== undefined) fields.aLine = cleanLine(data.aLine);
      if (data.bLine !== undefined) fields.bLine = cleanLine(data.bLine);
      await db
        .update(bondPairs)
        .set(fields as never)
        .where(eq(bondPairs.id, id));
      return this.getById(id);
    },

    async remove(id: string): Promise<void> {
      await db.delete(bondPairs).where(eq(bondPairs.id, id));
    },

    async removeChat(chatId: string): Promise<void> {
      await db.delete(bondPairs).where(eq(bondPairs.chatId, chatId));
    },

    /** A pair between two characters, if one is kept. */
    async find(chatId: string, firstId: string, secondId: string): Promise<BondPair | null> {
      const { aId, bId } = pairKey(firstId, secondId);
      const rows = (await db
        .select()
        .from(bondPairs)
        .where(and(eq(bondPairs.chatId, chatId), eq(bondPairs.aId, aId)))) as unknown as BondPairRow[];
      const row = rows.find((candidate) => candidate.bId === bId);
      return row ? toBondPair(row) : null;
    },
  };
}

/** What the writer model is told: "Vee & Gia (family): Estranged. Vee: … Gia: …" */
export function pairsPromptBlock(pairs: readonly BondPair[], nameFor: (characterId: string) => string): string {
  const lines = pairs.flatMap((pair) => {
    const a = nameFor(pair.aId);
    const b = nameFor(pair.bId);
    if (!a || !b) return [];
    const sides = [pair.aLine && `${a}: ${pair.aLine}`, pair.bLine && `${b}: ${pair.bLine}`].filter(Boolean);
    return [
      `- ${a} & ${b} (${pair.kind === "other" ? "acquainted" : pair.kind}): ${pair.rung}.${sides.length ? ` ${sides.join(" ")}` : ""}`,
    ];
  });
  return lines.length ? ["Between the characters:", ...lines].join("\n") : "";
}

/** One agent-reported pair, planned against what is kept: one rung per scene, as for bonds. */
export type PairPlan = {
  creations: { firstId: string; secondId: string; kind: ForkBondKind; rung: string; aLine: string; bLine: string }[];
  changes: { id: string; kind?: ForkBondKind; rung?: string; aLine?: string; bLine?: string }[];
};

/**
 * Read the agent's "pairs" list. Each entry names two characters ("a", "b"), may give a kind, a
 * wanted rung and a line for each side. Names that are not characters in the chat are skipped:
 * a pair is between two people the story has cards for.
 */
export function planPairUpdates(
  data: unknown,
  existing: readonly BondPair[],
  resolveCharacterId: (name: string) => string | null,
): PairPlan {
  const plan: PairPlan = { creations: [], changes: [] };
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const entries = Array.isArray(record.pairs) ? record.pairs : [];
  const seen = new Set<string>();
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const firstId = typeof entry.a === "string" ? resolveCharacterId(entry.a) : null;
    const secondId = typeof entry.b === "string" ? resolveCharacterId(entry.b) : null;
    if (!firstId || !secondId || firstId === secondId) continue;
    const { aId, bId, swapped } = pairKey(firstId, secondId);
    const key = `${aId}|${bId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lineA = cleanLine(swapped ? entry.b_feels : entry.a_feels);
    const lineB = cleanLine(swapped ? entry.a_feels : entry.b_feels);
    const namedKind = readForkBondKind(entry.kind);
    const match = existing.find((pair) => pair.aId === aId && pair.bId === bId);
    if (!match) {
      const kind = namedKind ?? "other";
      plan.creations.push({
        firstId: aId,
        secondId: bId,
        kind,
        rung: normalizeForkBondRung(kind, entry.rung) ?? defaultForkBondRung(kind),
        aLine: lineA,
        bLine: lineB,
      });
      continue;
    }
    const change: PairPlan["changes"][number] = { id: match.id };
    const kind = namedKind && namedKind !== match.kind ? namedKind : match.kind;
    if (kind !== match.kind) {
      change.kind = kind;
      change.rung = normalizeForkBondRung(kind, entry.rung) ?? defaultForkBondRung(kind);
    } else if (typeof entry.rung === "string") {
      const wanted = normalizeForkBondRung(kind, entry.rung);
      if (wanted && wanted !== match.rung) change.rung = stepForkBondRung(kind, match.rung, wanted);
    }
    if (lineA && lineA !== match.aLine) change.aLine = lineA;
    if (lineB && lineB !== match.bLine) change.bLine = lineB;
    if (Object.keys(change).length > 1) plan.changes.push(change);
  }
  return plan;
}

/** The agent's format for pairs, one line, built from the same shapes as the bonds. */
export function pairsAgentFormatLine(): string {
  const kinds = Object.keys(FORK_BOND_SHAPES).join(", ");
  return `Optional "pairs": [{"a":"","b":"","kind":"","rung":"","a_feels":"","b_feels":""}] for how two characters (never the user's character) stand with each other. kind is one of ${kinds}, rung is on that kind's ladder and moves one step per scene, a_feels and b_feels are one specific line each. Only include a pair this scene changed or revealed.`;
}

/** What the agent is shown of the pairs, so it reports changes rather than restating them. */
export function pairsAgentStateLines(pairs: readonly BondPair[], nameFor: (characterId: string) => string): string[] {
  return pairs.flatMap((pair) => {
    const a = nameFor(pair.aId);
    const b = nameFor(pair.bId);
    return a && b
      ? [JSON.stringify({ a, b, kind: pair.kind, rung: pair.rung, a_feels: pair.aLine, b_feels: pair.bLine })]
      : [];
  });
}
