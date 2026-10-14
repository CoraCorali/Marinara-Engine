// Fork feature: applying an agent's reading of the scene to the tracker (see FORK.md).
//
// The agent returns where it thinks each bond now stands. This decides what that is allowed to do
// to what is already stored, which is the whole safety of the feature: a tracker that a model can
// rewrite freely every turn is worse than no tracker, because it will contradict itself and the
// contradiction then goes back into the prompt.
import {
  FORK_BOND_CONDITIONS,
  FORK_BOND_DRIFTS,
  FORK_BOND_FALLING_OUT,
  FORK_BOND_FIELD_GUIDE,
  FORK_BOND_HEART_EVENT,
  FORK_BOND_KINDS,
  FORK_BOND_ROUTE_EXAMPLES,
  FORK_BOND_SHAPES,
  FORK_LOVE_STATUSES,
  defaultForkBondRung,
  forkBondRungDirection,
  normalizeForkBondCondition,
  normalizeForkBondDrift,
  normalizeForkBondKind,
  normalizeForkBondRung,
  normalizeForkLoveStatus,
  readForkBondKind,
  readForkLoveStatus,
  stepForkBondRung,
  type ForkBondKind,
  type ForkLoveStatus,
} from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { MAX_BOND_FIELD, MAX_BOND_ROUTE, cleanFields, createBondsStorage, type Bond } from "./fork-bonds.js";

/** The most rungs a romance's status may travel in one reply. People do not go from talking to married. */
export const MAX_STATUS_STEP = 1;

export type BondChange = {
  id: string;
  kind?: ForkBondKind;
  status?: ForkLoveStatus;
  rung?: string;
  route?: string;
  condition?: string;
  drift?: string;
  fields?: Record<string, string>;
};

export type BondCreation = {
  characterId: string;
  label: string;
  kind: ForkBondKind;
  status?: ForkLoveStatus;
  rung: string;
  route: string;
  condition: string;
  drift: string;
  fields: Record<string, string>;
};

/** A rung or status a bond moved through this reply, kept as a moment on its card. */
export type BondMomentPlan = { id: string; from: string; to: string; text: string };

export type AppliedBondUpdates = {
  changes: BondChange[];
  creations: BondCreation[];
  moments: BondMomentPlan[];
};

function readUpdates(data: unknown): Record<string, unknown>[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as { bonds?: unknown }).bonds
      : undefined;
  return Array.isArray(list)
    ? list.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

/**
 * A stable id for someone who is not a card. Letters in any script are kept, so two people with
 * names in Japanese or Cyrillic never collapse into the same "outsider-" id and merge.
 */
export function outsiderId(name: string): string {
  const slug = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `outsider-${slug || "someone"}`;
}

/** Names match the way a person means them to: case and surrounding spaces do not count. */
function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

/**
 * The detail fields an update carries. They may come nested under "fields" or flat beside "who",
 * since models do both; nested wins when both name the same field.
 */
function readFields(kind: ForkBondKind, update: Record<string, unknown>): Record<string, string> {
  const nested = update.fields && typeof update.fields === "object" ? (update.fields as Record<string, unknown>) : {};
  return cleanFields(kind, { ...update, ...nested });
}

function stepStatus(current: ForkLoveStatus | null, wanted: unknown): ForkLoveStatus | undefined {
  const target = readForkLoveStatus(wanted);
  if (!target) return undefined;
  const from = FORK_LOVE_STATUSES.indexOf(current ?? "talking");
  const to = FORK_LOVE_STATUSES.indexOf(target);
  if (to === from) return undefined;
  const capped = to > from ? Math.min(from + MAX_STATUS_STEP, to) : Math.max(from - MAX_STATUS_STEP, to);
  return FORK_LOVE_STATUSES[capped];
}

function cleanRoute(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_BOND_ROUTE) : undefined;
}

/**
 * Work out what an agent's reading actually changes.
 *
 * Nothing is applied blind. A bond it does not name is left alone, a rung moves at most one step in a
 * reply (onto another ladder it lands on that ladder's first rung), a romance moves at most one
 * status, a field it leaves out or sends empty is never cleared, and a name it does not recognise
 * becomes a new bond rather than overwriting the nearest one. When a rung rises the drift is a heart
 * event and when it falls a falling out, whatever the agent said, so the card cannot contradict
 * itself. Returning the work instead of doing it keeps this testable.
 */
export function planBondUpdates(
  data: unknown,
  existing: readonly Bond[],
  resolveCharacterId: (name: string) => string | null,
): AppliedBondUpdates {
  const changes: BondChange[] = [];
  const creations: BondCreation[] = [];
  const moments: BondMomentPlan[] = [];
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
    // The first version called a romance's status "stage".
    const wantedStatus = update.status ?? update.stage;

    const match = existing.find(
      (bond) =>
        !claimed.has(bond.id) &&
        (sameName(bond.label, who) || sameName(resolveCharacterId(who) ?? "\u0000", bond.characterId)),
    );

    if (!match) {
      // Somebody new in the story. Whatever rung the agent names is a first impression, so it is
      // taken as given rather than stepped; it has nothing to step from.
      const kind = normalizeForkBondKind(update.kind);
      creations.push({
        characterId: resolveCharacterId(who) ?? outsiderId(who),
        label: who,
        kind,
        ...(kind === "love" ? { status: normalizeForkLoveStatus(kind, wantedStatus) ?? "talking" } : {}),
        rung: normalizeForkBondRung(kind, update.rung) ?? defaultForkBondRung(kind),
        route: kind === "love" ? (cleanRoute(update.route) ?? "") : "",
        condition: normalizeForkBondCondition(update.condition) ?? "",
        drift: normalizeForkBondDrift(update.drift) ?? "",
        fields: readFields(kind, update),
      });
      continue;
    }

    claimed.add(match.id);
    const change: BondChange = { id: match.id };
    let touched = false;

    // A kind only changes when the agent names one it actually knows, so a missing field never
    // quietly resets a romance to "someone else".
    let kind = match.kind;
    const namedKind = readForkBondKind(update.kind);
    if (namedKind && namedKind !== match.kind) {
      kind = namedKind;
      change.kind = kind;
      touched = true;
    }
    const kindChanged = kind !== match.kind;

    // A new kind is a new ladder, so its rung is taken as named; on the same ladder it steps.
    const wantedRung = normalizeForkBondRung(kind, update.rung);
    const fromRung = kindChanged ? defaultForkBondRung(kind) : match.rung;
    const rung = wantedRung ? (kindChanged ? wantedRung : stepForkBondRung(kind, match.rung, wantedRung)) : fromRung;
    if (rung !== match.rung || kindChanged) {
      change.rung = rung;
      touched = true;
    }

    if (kind === "love") {
      const status = kindChanged
        ? (normalizeForkLoveStatus("love", wantedStatus) ?? "talking")
        : stepStatus(match.status, wantedStatus);
      if (status) {
        change.status = status;
        touched = true;
      }
      const route = cleanRoute(update.route);
      if (route && route !== match.route) {
        change.route = route;
        touched = true;
      }
    }

    const condition = normalizeForkBondCondition(update.condition);
    if (condition && condition !== match.condition) {
      change.condition = condition;
      touched = true;
    }

    // The drift follows the rung when the rung moved; otherwise it is whatever the agent read.
    const direction = kindChanged ? 0 : forkBondRungDirection(kind, match.rung, rung);
    const drift =
      direction > 0
        ? FORK_BOND_HEART_EVENT
        : direction < 0
          ? FORK_BOND_FALLING_OUT
          : normalizeForkBondDrift(update.drift);
    if (drift && drift !== match.drift) {
      change.drift = drift;
      touched = true;
    }

    const fields = readFields(kind, update);
    const changedFields = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => kindChanged || match.fields[key] !== value),
    );
    if (Object.keys(changedFields).length > 0) {
      change.fields = changedFields;
      touched = true;
    }

    if (touched) changes.push(change);

    // Moments: only real moves on the same ladder or status line, told by the scene's own turn.
    if (!kindChanged) {
      const text = (fields.turn ?? fields.memory ?? "").slice(0, MAX_BOND_FIELD);
      if (change.rung && change.rung !== match.rung)
        moments.push({ id: match.id, from: match.rung, to: change.rung, text });
      if (change.status && change.status !== match.status) {
        moments.push({ id: match.id, from: match.status ?? "", to: change.status, text });
      }
    }
  }

  return { changes, creations, moments };
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
): Promise<{ changed: number; added: number; moments: number }> {
  const store = createBondsStorage(db);
  const plan = planBondUpdates(data, await store.listForChat(chatId), resolveCharacterId);
  for (const { id, ...patch } of plan.changes) await store.update(id, patch);
  for (const creation of plan.creations) await store.create({ chatId, ...creation });
  for (const moment of plan.moments) await store.addMoment({ bondId: moment.id, chatId, ...moment });
  return { changed: plan.changes.length, added: plan.creations.length, moments: plan.moments.length };
}

/** The format the agent writes in, built from the shared shapes so it can never drift from them. */
export function bondsAgentFormatBlock(): string {
  const kinds = FORK_BOND_KINDS.map((kind) => {
    const shape = FORK_BOND_SHAPES[kind];
    const ladders = shape.ladders.map((ladder) => ladder.join(" → ")).join("; or cold: ");
    return `- ${kind}: rungs ${ladders}${shape.tangled.length ? `; tangled: ${shape.tangled.join(", ")}` : ""}. Fields: ${shape.fields.join(", ")}.`;
  });
  const guide = Object.entries(FORK_BOND_FIELD_GUIDE).map(([key, text]) => `- ${key}: ${text}`);
  return [
    "<relationship_tracker_format>",
    'Reply with JSON only: {"bonds":[{"who":"","kind":"","rung":"","status":"","route":"","condition":"","drift":"","heart":"","trust":"", ...}]}',
    "This format replaces any older one you were given (first/second numbers and a note are no longer used).",
    "Kinds, their rungs (lowest first) and their fields:",
    ...kinds,
    `- status applies to love only: ${FORK_LOVE_STATUSES.join(", ")}. It is where the romance has got to, separate from how they feel.`,
    `- route applies to love only: an emoji and a route name, e.g. ${FORK_BOND_ROUTE_EXAMPLES.slice(0, 5).join(", ")}. Change it only when the story truly turns.`,
    `- condition, one of: ${FORK_BOND_CONDITIONS.join(", ")}.`,
    `- drift, one of: ${FORK_BOND_DRIFTS.join(", ")}.`,
    "What each field asks for:",
    ...guide,
    "Rules:",
    "- Everything is words, never numbers. Write every field as specific, lived detail from this story.",
    "- Heart and trust are separate truths and may disagree.",
    "- Move at most one rung per scene, and only when the scene earned it; most scenes move nothing. Name the moment in turn.",
    "- Likes and dislikes are discoveries; grow them as the story reveals more.",
    "- Memory is a keepsake: replace it only when a new moment clearly outshines it.",
    "- Leave out any person the scene said nothing about, and any field you are not sure changed. Never send an empty field to clear one.",
    "</relationship_tracker_format>",
  ].join("\n");
}

/**
 * What the tracker holds right now, plus the format, for the agent that updates it. Without the
 * state the agent guesses everything from scratch each turn; without the format an agent made from
 * an older prompt would answer in the old shape.
 */
export function bondsAgentStateBlock(allBonds: readonly Bond[], nameFor: (characterId: string) => string): string {
  const current = allBonds.map((bond) => ({
    who: bond.label.trim() || nameFor(bond.characterId) || bond.characterId,
    kind: bond.kind,
    rung: bond.rung,
    ...(bond.status ? { status: bond.status } : {}),
    ...(bond.route ? { route: bond.route } : {}),
    ...(bond.condition ? { condition: bond.condition } : {}),
    ...(bond.drift ? { drift: bond.drift } : {}),
    ...bond.fields,
  }));
  return [
    bondsAgentFormatBlock(),
    "<current_relationships>",
    current.length > 0
      ? 'What the relationship tracker holds right now. Use these exact names in "who", and report only what this scene changed.'
      : "The relationship tracker holds nothing yet. Add a bond only for someone the scene gives a real relationship with the user's character.",
    ...(current.length > 0 ? [JSON.stringify(current)] : []),
    "</current_relationships>",
  ].join("\n");
}

/** Loads a chat's bonds into that block. */
export async function loadBondsAgentState(
  db: DB,
  chatId: string,
  nameFor: (characterId: string) => string,
): Promise<string> {
  return bondsAgentStateBlock(await createBondsStorage(db).listForChat(chatId), nameFor);
}
