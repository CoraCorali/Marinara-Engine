// Fork feature: applying an agent's reading of the scene to the tracker (see FORK.md).
//
// The agent returns where it thinks each bond now stands. This decides what that is allowed to do
// to what is already stored, which is the whole safety of the feature: a tracker that a model can
// rewrite freely every turn is worse than no tracker, because it will contradict itself and the
// contradiction then goes back into the prompt.
import type { DB } from "../../db/connection.js";
import {
  BOND_KINDS,
  LOVE_STAGES,
  clampMeter,
  createBondsStorage,
  normalizeKind,
  normalizeStage,
  type Bond,
  type BondKind,
  type LoveStage,
} from "./fork-bonds.js";

/**
 * The most a meter may move in one reply.
 *
 * Relationships are the slowest thing in a story and the fastest thing for a model to overreact
 * about: one sharp line and it will happily send patience from 80 to 5. Capping the step means the
 * tracker moves rather than teleports, and a real collapse still gets there over a few turns,
 * which is roughly how long it takes in the writing anyway.
 */
export const MAX_METER_STEP = 20;

/** The most rungs a romance may travel in one reply. People do not go from talking to married. */
export const MAX_STAGE_STEP = 1;

export type BondUpdate = {
  who?: unknown;
  kind?: unknown;
  stage?: unknown;
  first?: unknown;
  second?: unknown;
  note?: unknown;
};

export type BondChange = {
  id: string;
  kind?: BondKind;
  stage?: LoveStage;
  first?: number;
  second?: number;
  note?: string;
};

export type BondCreation = {
  characterId: string;
  label: string;
  kind: BondKind;
  stage?: LoveStage;
  first: number;
  second: number;
  note: string;
};

export type AppliedBondUpdates = {
  changes: BondChange[];
  creations: BondCreation[];
};

function readUpdates(data: unknown): BondUpdate[] {
  if (Array.isArray(data)) return data as BondUpdate[];
  if (data && typeof data === "object") {
    const list = (data as { bonds?: unknown }).bonds;
    if (Array.isArray(list)) return list as BondUpdate[];
  }
  return [];
}

/** Names match the way a person means them to: case and surrounding spaces do not count. */
function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function stepMeter(current: number, wanted: unknown, fallback: number): number | undefined {
  if (wanted === undefined || wanted === null || wanted === "") return undefined;
  const target = clampMeter(wanted, fallback);
  if (target === current) return undefined;
  const capped = Math.max(current - MAX_METER_STEP, Math.min(current + MAX_METER_STEP, target));
  return capped === current ? undefined : capped;
}

function stepStage(current: LoveStage | null, wanted: unknown): LoveStage | undefined {
  const target = normalizeStage("love", wanted);
  if (!target) return undefined;
  const from = LOVE_STAGES.indexOf(current ?? "talking");
  const to = LOVE_STAGES.indexOf(target);
  if (to === from) return undefined;
  const capped = to > from ? Math.min(from + MAX_STAGE_STEP, to) : Math.max(from - MAX_STAGE_STEP, to);
  return LOVE_STAGES[capped];
}

/**
 * Work out what an agent's reading actually changes.
 *
 * Nothing is applied blind. A bond it does not name is left alone, a meter may only move so far in
 * one reply, a romance may only move one rung, and a name it does not recognise becomes a new bond
 * rather than overwriting the nearest one. Returning the work instead of doing it keeps this
 * testable and keeps the storage calls in one place.
 */
export function planBondUpdates(
  data: unknown,
  existing: readonly Bond[],
  resolveCharacterId: (name: string) => string | null,
): AppliedBondUpdates {
  const changes: BondChange[] = [];
  const creations: BondCreation[] = [];
  const claimed = new Set<string>();
  // A model that mentions the same person twice in one reading must not produce two bonds for
  // them. The first mention wins; the second is a restatement, not a second person.
  const seen = new Set<string>();

  for (const update of readUpdates(data)) {
    const who = typeof update.who === "string" ? update.who.trim() : "";
    if (!who) continue;
    const nameKey = who.toLocaleLowerCase();
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);

    const match = existing.find(
      (bond) =>
        !claimed.has(bond.id) &&
        (sameName(bond.label, who) || sameName(resolveCharacterId(who) ?? "\u0000", bond.characterId)),
    );

    if (!match) {
      // Somebody new in the story. A bond it invents starts in the middle rather than at whatever
      // number it felt like, because a first impression is not a measurement.
      const characterId = resolveCharacterId(who);
      const kind = normalizeKind(update.kind);
      creations.push({
        characterId: characterId ?? `outsider-${who.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label: who,
        kind,
        ...(kind === "love" ? { stage: normalizeStage(kind, update.stage) ?? "talking" } : {}),
        first: clampMeter(update.first, 50),
        second: clampMeter(update.second, 50),
        note: typeof update.note === "string" ? update.note.trim().slice(0, 400) : "",
      });
      continue;
    }

    claimed.add(match.id);
    const change: BondChange = { id: match.id };
    let touched = false;

    // A kind only changes when the agent names one it actually knows, so a missing field never
    // quietly resets a romance to "knows each other".
    if (typeof update.kind === "string" && BOND_KINDS.includes(update.kind as BondKind)) {
      const kind = normalizeKind(update.kind);
      if (kind !== match.kind) {
        change.kind = kind;
        touched = true;
      }
    }

    const kindNow = change.kind ?? match.kind;
    if (kindNow === "love") {
      const stage = stepStage(match.stage, update.stage);
      if (stage) {
        change.stage = stage;
        touched = true;
      }
    }

    const first = stepMeter(match.first, update.first, match.first);
    if (first !== undefined) {
      change.first = first;
      touched = true;
    }
    const second = stepMeter(match.second, update.second, match.second);
    if (second !== undefined) {
      change.second = second;
      touched = true;
    }

    if (typeof update.note === "string") {
      const note = update.note.trim().slice(0, 400);
      if (note && note !== match.note) {
        change.note = note;
        touched = true;
      }
    }

    if (touched) changes.push(change);
  }

  return { changes, creations };
}

/**
 * Plan an agent's reading and write it.
 *
 * Both the normal generation route and the retry route need exactly this, so the writes live here
 * rather than twice in two very large route files. Returns how much moved, for the debug log.
 */
export async function applyBondsAgentResult(
  db: DB,
  chatId: string,
  data: unknown,
  resolveCharacterId: (name: string) => string | null,
): Promise<{ changed: number; added: number }> {
  const store = createBondsStorage(db);
  const plan = planBondUpdates(data, await store.listForChat(chatId), resolveCharacterId);
  for (const { id, ...patch } of plan.changes) await store.update(id, patch);
  for (const creation of plan.creations) await store.create({ chatId, ...creation });
  return { changed: plan.changes.length, added: plan.creations.length };
}
