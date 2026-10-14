// Fork feature: the story keeps the board's things up to date (see FORK.md).
//
// The relationship tracker agent already reads every reply. It is also shown the chat's things and
// may report how one is now ("low on gas" → "out of gas") and who has it. Its changes are kept with
// the reply's tracker turn, so a swipe or a deleted reply takes them back like a relationship move.
import {
  FORK_PIN_WHO_PERSONA,
  FORK_THING_AT_PLACE,
  FORK_THING_LOST,
  MAX_FORK_PIN_LINE,
  forkMessageMentionsPin,
  normalizeTextForMatch,
} from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { createBoardPinsStorage, type BoardPin } from "./fork-board-pins.js";

/** The most things the agent is shown, so a busy board does not swamp its prompt. */
const MAX_THINGS_IN_STATE = 20;

export type ThingTurnChange = {
  bondId: string;
  thing: true;
  before: { status?: string; holder?: string };
  after: { status?: string; holder?: string };
};

export function thingsAgentFormatLine(): string {
  return 'Optional "things": [{"name":"","now":"","with":""}] for things listed in current_things that this scene changed. "now" is how the thing is right now in a few words (for example: out of gas, cracked screen). "with" is who has it now (a name), "lost", or the name of the place it was left. Use the exact names from current_things, and leave out any thing the scene did not change.';
}

function whoName(who: string, nameFor: (id: string) => string, personaName: string, all: readonly BoardPin[]): string {
  if (!who) return "";
  if (who === FORK_PIN_WHO_PERSONA) return personaName;
  if (who === FORK_THING_LOST) return "lost";
  if (who.startsWith(FORK_THING_AT_PLACE)) {
    const place = all.find((pin) => pin.id === who.slice(FORK_THING_AT_PLACE.length));
    return place?.name || place?.caption || "";
  }
  return nameFor(who) || who;
}

/** What the agent is shown: each named thing on the chat's board, how it is and who has it. */
export function thingsAgentStateLines(
  pins: readonly BoardPin[],
  nameFor: (id: string) => string,
  personaName: string,
): string[] {
  const things = pins.filter((pin) => pin.category === "thing" && pin.name).slice(0, MAX_THINGS_IN_STATE);
  if (things.length === 0) return [];
  return [
    "<current_things>",
    "Things on the story's board. Report only what this scene changed about them.",
    ...things.map((pin) =>
      JSON.stringify({
        name: pin.name,
        now: pin.details.status ?? "",
        with: whoName(pin.details.holder ?? "", nameFor, personaName, pins),
      }),
    ),
    "</current_things>",
  ];
}

/** Turns a "with" answer into a holder: the persona, a character, lost, a place pin, or the name as said. */
function resolveHolder(
  value: string,
  resolveCharacterId: (name: string) => string | null,
  personaName: string,
  pins: readonly BoardPin[],
): string {
  const wanted = normalizeTextForMatch(value);
  if (!wanted) return "";
  if (wanted === "lost" || wanted === "missing") return FORK_THING_LOST;
  if (personaName && wanted === normalizeTextForMatch(personaName)) return FORK_PIN_WHO_PERSONA;
  const characterId = resolveCharacterId(value);
  if (characterId) return characterId;
  const place = pins.find((pin) => pin.category === "place" && pin.name && normalizeTextForMatch(pin.name) === wanted);
  if (place) return `${FORK_THING_AT_PLACE}${place.id}`;
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** What the agent's "things" list may change: the status line and the holder of a thing it named. */
export function planThingUpdates(
  data: unknown,
  pins: readonly BoardPin[],
  resolveCharacterId: (name: string) => string | null,
  personaName: string,
): ThingTurnChange[] {
  const list = (data as { things?: unknown } | null)?.things;
  if (!Array.isArray(list)) return [];
  const changes: ThingTurnChange[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const update = entry as { name?: unknown; now?: unknown; with?: unknown };
    const name = typeof update.name === "string" ? normalizeTextForMatch(update.name) : "";
    const pin = pins.find(
      (candidate) => candidate.category === "thing" && candidate.name && normalizeTextForMatch(candidate.name) === name,
    );
    if (!pin || changes.some((change) => change.bondId === pin.id)) continue;
    const change: ThingTurnChange = { bondId: pin.id, thing: true, before: {}, after: {} };
    const status =
      typeof update.now === "string" ? update.now.replace(/\s+/g, " ").trim().slice(0, MAX_FORK_PIN_LINE) : "";
    if (status && status !== (pin.details.status ?? "")) {
      change.before.status = pin.details.status ?? "";
      change.after.status = status;
    }
    const holder =
      typeof update.with === "string" ? resolveHolder(update.with, resolveCharacterId, personaName, pins) : "";
    if (holder && holder !== (pin.details.holder ?? "")) {
      change.before.holder = pin.details.holder ?? "";
      change.after.holder = holder;
    }
    if (change.after.status !== undefined || change.after.holder !== undefined) changes.push(change);
  }
  return changes;
}

export async function applyThingUpdates(
  db: DB,
  chatId: string,
  data: unknown,
  resolveCharacterId: (name: string) => string | null,
  personaName: string,
): Promise<ThingTurnChange[]> {
  const store = createBoardPinsStorage(db);
  const changes = planThingUpdates(data, await store.listForScope("chat", chatId), resolveCharacterId, personaName);
  for (const change of changes) await store.update(change.bondId, { details: { ...change.after } });
  return changes;
}

/** Puts a thing back as it was before a run, while it still holds what that run left. */
export async function undoThingChange(db: DB, change: ThingTurnChange): Promise<void> {
  const store = createBoardPinsStorage(db);
  const pin = await store.getById(change.bondId);
  if (!pin) return;
  const patch: Record<string, unknown> = {};
  if (change.after.status !== undefined && (pin.details.status ?? "") === change.after.status)
    patch.status = change.before.status ?? "";
  if (change.after.holder !== undefined && (pin.details.holder ?? "") === change.after.holder)
    patch.holder = change.before.holder ?? "";
  if (Object.keys(patch).length > 0) await store.update(pin.id, { details: patch });
}

/** The things as a swipe's agent should see them: before the run being replaced. */
export function thingsBeforeChanges(pins: readonly BoardPin[], changes: readonly ThingTurnChange[]): BoardPin[] {
  return pins.map((pin) => {
    const change = changes.find((entry) => entry.bondId === pin.id);
    if (!change) return pin;
    const details = { ...pin.details };
    if (change.after.status !== undefined && (details.status ?? "") === change.after.status)
      details.status = change.before.status || undefined;
    if (change.after.holder !== undefined && (details.holder ?? "") === change.after.holder)
      details.holder = change.before.holder || undefined;
    return { ...pin, details };
  });
}

/**
 * A thing named in a chapter's recap keeps the recap's sentence about it as a memory of that
 * chapter ("Ch. 2 · Theo drove it home in the rain"). A fresh recap of the same chapter replaces it.
 */
export async function rememberThingsFromRecap(db: DB, chatId: string, chapter: number, recap: string): Promise<number> {
  const store = createBoardPinsStorage(db);
  const happened = (recap.split(/^##\s+/m).find((section) => /^what happened/i.test(section)) ?? recap)
    .replace(/^what happened\s*/i, "")
    .trim();
  const sentences = happened
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  let remembered = 0;
  for (const pin of await store.listForScope("chat", chatId)) {
    if (pin.category !== "thing" || !pin.name) continue;
    const sentence = sentences.find((candidate) => forkMessageMentionsPin(candidate, pin.name));
    const others = (pin.details.memories ?? []).filter((memory) => memory.chapter !== chapter);
    if (!sentence) {
      if (others.length !== (pin.details.memories ?? []).length)
        await store.update(pin.id, { details: { memories: others } });
      continue;
    }
    const memories = [...others, { chapter, text: sentence.slice(0, 300) }].sort((a, b) => a.chapter - b.chapter);
    await store.update(pin.id, { details: { memories } });
    remembered++;
  }
  return remembered;
}
