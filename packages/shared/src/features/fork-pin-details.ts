// Fork feature: what a board pin knows beyond its picture and caption (see FORK.md).
//
// Clothes have a slot and a wearer; places, things, people and vibes get their own few fields here,
// kept as one JSON object on the pin so the board's table needs no new column per category. Every
// field is optional and normalised on the way in and out, so an old pin reads as an empty one.
import { forkMessageMentionsPin } from "./fork-board-shapes.js";

export const MAX_FORK_PIN_NAME = 80;
export const MAX_FORK_PIN_LINE = 200;
export const MAX_FORK_PIN_FEELINGS = 8;
export const MAX_FORK_PIN_MEMORIES = 12;
export const MAX_FORK_PIN_ALBUM = 8;
export const MAX_FORK_VIBE_COLORS = 6;
export const MAX_FORK_VIBE_WORDS = 8;

/** When an album picture shows the place. */
export const FORK_PLACE_LOOKS = ["day", "night", "rain"] as const;
export type ForkPlaceLook = (typeof FORK_PLACE_LOOKS)[number];

/** Where a thing is when no one has it. */
export const FORK_THING_LOST = "lost";
/** A thing left at a place pin is held as "place:<pin id>". */
export const FORK_THING_AT_PLACE = "place:";

export type ForkPinDetails = {
  /** Place: the room inside the building the pin is named for ("kitchen"). */
  room?: string;
  /** Place, person, thing: comes into the scene by itself when the story is there, they are present, or it is. */
  followStory?: boolean;
  /** Place: more pictures, each optionally for day, night or rain. */
  album?: { path: string; look: ForkPlaceLook | "" }[];
  /** Thing: whose it is ("persona", a character id, or "" for nobody). */
  owner?: string;
  /** Thing: who has it now ("persona", a character id), "place:<pin id>", "lost", or "". */
  holder?: string;
  /** Thing: the thing it is inside (a pin id). */
  inside?: string;
  /** Thing: how it is right now ("low on gas", "cracked"); the story can change it. */
  status?: string;
  /** Thing: how people feel about it. */
  feelings?: { who: string; text: string }[];
  /** Thing: moments it was part of, from chapter recaps. */
  memories?: { chapter: number; text: string }[];
  /** Thing: a planted detail to pay off later. */
  important?: boolean;
  /** Person: who they are to the story ("Theo's mom"). */
  role?: string;
  /** Person: the character card they are, when there is one. */
  characterId?: string;
  /** Vibe: colours, as #rrggbb. */
  palette?: string[];
  /** Vibe: mood words. */
  words?: string[];
  /** Vibe: for the chapter it was set in, or the whole story. */
  span?: "chapter" | "story";
  /** Vibe: the chapter a "chapter" vibe belongs to. */
  chapter?: number;
};

function line(value: unknown, max = MAX_FORK_PIN_LINE): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function normalizeForkPinName(value: unknown): string {
  return line(value, MAX_FORK_PIN_NAME);
}

/** Keeps only fields that hold something, so an empty pin stays `{}`. */
export function normalizeForkPinDetails(raw: unknown): ForkPinDetails {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const out: ForkPinDetails = {};
  const room = line(input.room, MAX_FORK_PIN_NAME);
  if (room) out.room = room;
  if (typeof input.followStory === "boolean") out.followStory = input.followStory;
  if (Array.isArray(input.album)) {
    const album = input.album.flatMap((entry) => {
      const item = entry as { path?: unknown; look?: unknown } | null;
      const path = typeof item?.path === "string" ? item.path.trim() : "";
      if (!path) return [];
      const look: ForkPlaceLook | "" = FORK_PLACE_LOOKS.includes(item?.look as ForkPlaceLook)
        ? (item?.look as ForkPlaceLook)
        : "";
      return [{ path, look }];
    });
    if (album.length) out.album = album.slice(0, MAX_FORK_PIN_ALBUM);
  }
  for (const key of ["owner", "holder", "inside", "characterId"] as const) {
    const text = line(input[key], 120);
    if (text) out[key] = text;
  }
  const status = line(input.status);
  if (status) out.status = status;
  const role = line(input.role, MAX_FORK_PIN_NAME);
  if (role) out.role = role;
  if (Array.isArray(input.feelings)) {
    const feelings = input.feelings.flatMap((entry) => {
      const item = entry as { who?: unknown; text?: unknown } | null;
      const who = line(item?.who, 120);
      const text = line(item?.text);
      return who && text ? [{ who, text }] : [];
    });
    if (feelings.length) out.feelings = feelings.slice(0, MAX_FORK_PIN_FEELINGS);
  }
  if (Array.isArray(input.memories)) {
    const memories = input.memories.flatMap((entry) => {
      const item = entry as { chapter?: unknown; text?: unknown } | null;
      const chapter = typeof item?.chapter === "number" && Number.isInteger(item.chapter) ? item.chapter : 0;
      const text = line(item?.text, 300);
      return text ? [{ chapter, text }] : [];
    });
    if (memories.length) out.memories = memories.slice(-MAX_FORK_PIN_MEMORIES);
  }
  if (input.important === true) out.important = true;
  if (Array.isArray(input.palette)) {
    const palette = input.palette
      .filter((color): color is string => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color.trim()))
      .map((color) => color.trim().toLowerCase());
    if (palette.length) out.palette = palette.slice(0, MAX_FORK_VIBE_COLORS);
  }
  if (Array.isArray(input.words)) {
    const words = input.words.map((word) => line(word, 40)).filter(Boolean);
    if (words.length) out.words = [...new Set(words)].slice(0, MAX_FORK_VIBE_WORDS);
  }
  if (input.span === "chapter" || input.span === "story") out.span = input.span;
  if (typeof input.chapter === "number" && Number.isInteger(input.chapter) && input.chapter > 0)
    out.chapter = input.chapter;
  return out;
}

/** Places and people follow the story unless switched off; things only when switched on. */
export function forkPinFollowsStory(category: string, details: ForkPinDetails): boolean {
  if (category === "place" || category === "person") return details.followStory !== false;
  if (category === "thing") return details.followStory === true;
  return false;
}

/**
 * Whether the story's location is this place: its name ("Theo's apartment") and, when it has one,
 * its room ("kitchen") both appear in the location line ("Theo's apartment · kitchen").
 */
export function forkPlaceMatchesLocation(location: string, name: string, room = ""): boolean {
  if (!location.trim() || !name.trim()) return false;
  if (!forkMessageMentionsPin(location, name)) return false;
  return !room.trim() || forkMessageMentionsPin(location, room);
}

/** The picture a place shows now: rain beats night beats day; the pin's own picture otherwise. */
export function forkPlaceLookFor(
  details: ForkPinDetails,
  imagePath: string,
  now: { night: boolean; raining: boolean },
): string {
  const pick = (look: ForkPlaceLook) => details.album?.find((entry) => entry.look === look)?.path;
  return (now.raining && pick("rain")) || (now.night ? pick("night") : pick("day")) || imagePath;
}

/** The story's hour from a time line ("11:00 PM", "23:00", "2 pm"), or -1 when it does not say. */
export function forkStoryHour(time: string | null | undefined): number {
  const t = (time ?? "").toLowerCase();
  const clock = t.match(/\b(\d{1,2})[:.h](\d{2})\b/) ?? t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (!clock) return -1;
  let hour = parseInt(clock[1]!, 10);
  if (/pm/.test(t) && hour < 12) hour += 12;
  if (/am/.test(t) && hour === 12) hour = 0;
  return hour >= 0 && hour < 24 ? hour : -1;
}

/** Night by the clock, or by the words when there is no clock ("late evening", "midnight"). */
export function forkStoryIsNight(time: string | null | undefined): boolean {
  const hour = forkStoryHour(time);
  if (hour >= 0) return hour >= 20 || hour < 5;
  return /\b(night|midnight|late evening)\b/i.test(time ?? "");
}

export function forkStoryIsRaining(weather: string | null | undefined): boolean {
  return /\b(rain|rainy|raining|drizzl\w*|shower\w*|storm\w*|thunder\w*|downpour)\b/i.test(weather ?? "");
}
