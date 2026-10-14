// Fork feature: reference board (see FORK.md).
//
// A pin is a reference picture with a caption. Pins marked "in scene" are sent to the model with
// every reply, so an outfit or a room stays the same instead of drifting. Chat pins belong to one
// roleplay; persona pins (hair, jewellery, a wedding ring) follow a persona into every chat.
//
// The table registers itself through the store's registerTables, the same path capability packages
// use, so it needs no storage-format bump and an older Marinara simply ignores the file.
import {
  FORK_PIN_WHO_PERSONA,
  FORK_THING_AT_PLACE,
  forkMessageMentionsPin,
  forkPinFollowsStory,
  forkPlaceLookFor,
  forkPlaceMatchesLocation,
  forkWearSlotsReplacedBy,
  normalizeForkPinDetails,
  normalizeForkPinName,
  normalizeForkPinShows,
  normalizeForkWearSlot,
  type ForkPinDetails,
  type ForkPinShows,
  type ForkWearSlot,
} from "@marinara-engine/shared";
import { eq, asc } from "../../db/file-query.js";
import { fileTable, text, integer } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

/** A chat's board, a persona's always-on board, or one outfit in the closet. */
export type BoardScopeType = "chat" | "persona" | "outfit";

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
  /** Who the pin is about: "persona", a character id, "scene", or "" when nobody said. */
  who: text("who").notNull().default(""),
  /** For a wearing pin, what it covers (outfit, shoes, hair...). */
  slot: text("slot").notNull().default(""),
  /** "model" when the picture shows the clothes on someone, "clothes" when it shows only them. */
  shows: text("shows").notNull().default("model"),
  /** A place's building, a thing's or a person's name, a vibe's title. */
  name: text("name").notNull().default(""),
  /** What the pin's category knows beyond the picture (see fork-pin-details), as JSON. */
  details: text("details").notNull().default("{}"),
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
  who?: string;
  slot?: string;
  shows?: string;
  name?: string;
  details?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardPin = {
  id: string;
  scopeType: BoardScopeType;
  scopeId: string;
  imagePath: string;
  caption: string;
  category: BoardPinCategory;
  inScene: boolean;
  who: string;
  slot: ForkWearSlot | "";
  shows: ForkPinShows;
  name: string;
  details: ForkPinDetails;
  order: number;
  createdAt: string;
};

/** What the story looks like right now, for the pins that follow it. */
export type BoardStoryNow = {
  location?: string;
  night?: boolean;
  raining?: boolean;
  /** Who is in the scene: "persona" and character ids. */
  presentIds?: readonly string[];
  /** Names the scene lists as present (side characters without a card included). */
  presentNames?: readonly string[];
  /** The current chapter, for vibes set for one chapter. */
  chapter?: number;
};

export type BoardPinFields = {
  caption?: string;
  category?: unknown;
  inScene?: boolean;
  who?: unknown;
  slot?: unknown;
  shows?: unknown;
  name?: unknown;
  /** Merged into the pin's details: a key set to null or "" clears it. */
  details?: Record<string, unknown>;
  order?: number;
};

function cleanWho(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function normalizeCategory(value: unknown): BoardPinCategory {
  return BOARD_PIN_CATEGORIES.includes(value as BoardPinCategory) ? (value as BoardPinCategory) : "wearing";
}

export function toBoardPin(row: BoardPinRow): BoardPin {
  return {
    id: row.id,
    scopeType: row.scopeType === "persona" || row.scopeType === "outfit" ? row.scopeType : "chat",
    scopeId: row.scopeId,
    imagePath: row.imagePath,
    caption: row.caption ?? "",
    category: normalizeCategory(row.category),
    inScene: row.inScene !== "false",
    // A persona's own board is about the persona unless it says otherwise.
    who: row.who || (row.scopeType === "persona" ? FORK_PIN_WHO_PERSONA : ""),
    slot: normalizeCategory(row.category) === "wearing" ? normalizeForkWearSlot(row.slot) : "",
    shows: normalizeForkPinShows(row.shows),
    name: normalizeForkPinName(row.name),
    details: normalizeForkPinDetails(row.details),
    order: row.order ?? 0,
    createdAt: row.createdAt ?? "",
  };
}

/** Clears a key with null, "" or an empty list; anything else replaces it. */
export function mergePinDetails(current: ForkPinDetails, patch: Record<string, unknown>): ForkPinDetails {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
  }
  return normalizeForkPinDetails(next);
}

/** Every picture a pin owns: its own and its album's. */
export function pinImagePaths(pin: BoardPin): string[] {
  return [pin.imagePath, ...(pin.details.album ?? []).map((entry) => entry.path)];
}

/**
 * Whether a pin that follows the story is part of the scene now: a place the story is in, a person
 * who is present, a thing someone present has, or a thing left at (or inside something at) such a
 * place. Vibes and clothes never come in by themselves.
 */
export function pinFollowsInto(pin: BoardPin, now: BoardStoryNow, all: readonly BoardPin[], depth = 0): boolean {
  if (!forkPinFollowsStory(pin.category, pin.details) || depth > 4) return false;
  if (pin.category === "place") return forkPlaceMatchesLocation(now.location ?? "", pin.name, pin.details.room);
  if (pin.category === "person") {
    const linked = pin.details.characterId ?? "";
    if (linked && now.presentIds?.includes(linked)) return true;
    const name = pin.name || pin.caption;
    return Boolean(name) && (now.presentNames ?? []).some((present) => forkMessageMentionsPin(present, name));
  }
  if (pin.category === "thing") {
    const holder = pin.details.holder ?? "";
    if (holder.startsWith(FORK_THING_AT_PLACE)) {
      const place = all.find((entry) => entry.id === holder.slice(FORK_THING_AT_PLACE.length));
      return Boolean(place && (place.inScene || pinFollowsInto(place, now, all, depth + 1)));
    }
    if (holder && now.presentIds?.includes(holder)) return true;
    const container = pin.details.inside ? all.find((entry) => entry.id === pin.details.inside) : null;
    return Boolean(container && (container.inScene || pinFollowsInto(container, now, all, depth + 1)));
  }
  return false;
}

/** A vibe set for one chapter stays in that chapter. */
function vibeFits(pin: BoardPin, now: BoardStoryNow): boolean {
  return pin.category !== "vibe" || pin.details.span !== "chapter" || !pin.details.chapter || !now.chapter
    ? true
    : pin.details.chapter === now.chapter;
}

export function createBoardPinsStorage(db: DB) {
  return {
    async listForScope(scopeType: BoardScopeType, scopeId: string): Promise<BoardPin[]> {
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

    async create(
      input: {
        scopeType: BoardScopeType;
        scopeId: string;
        imagePath: string;
      } & BoardPinFields,
    ): Promise<BoardPin | null> {
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
        who: cleanWho(input.who),
        slot: normalizeForkWearSlot(input.slot),
        shows: normalizeForkPinShows(input.shows),
        name: normalizeForkPinName(input.name),
        details: JSON.stringify(input.details ? mergePinDetails({}, input.details) : {}),
        order: existing.length > 0 ? existing[existing.length - 1]!.order + 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(boardPins).values(row as never);
      const pin = toBoardPin(row);
      await this.stepAsideFor(pin);
      return pin;
    },

    /**
     * One of each thing per person in scene: a pin that goes into the scene takes the others it
     * replaces out of it (new shoes replace old shoes; a full outfit replaces a top and a bottom),
     * so the model is never told two outfits at once. The others stay on the board to swap back.
     */
    async stepAsideFor(pin: BoardPin): Promise<void> {
      if (!pin.inScene || pin.category !== "wearing" || !pin.who || !pin.slot) return;
      const replaced = forkWearSlotsReplacedBy(pin.slot);
      const rows = (await db
        .select()
        .from(boardPins)
        .where(eq(boardPins.scopeId, pin.scopeId))) as unknown as BoardPinRow[];
      for (const other of rows.map(toBoardPin)) {
        if (other.id === pin.id || other.scopeType !== pin.scopeType || !other.inScene) continue;
        if (other.category !== "wearing" || other.who !== pin.who || !replaced.includes(other.slot as ForkWearSlot))
          continue;
        await db
          .update(boardPins)
          .set({ inScene: "false", updatedAt: now() } as never)
          .where(eq(boardPins.id, other.id));
      }
    },

    async update(id: string, data: BoardPinFields): Promise<BoardPin | null> {
      const fields: Record<string, unknown> = { updatedAt: now() };
      if (data.caption !== undefined) fields.caption = data.caption.slice(0, MAX_BOARD_PIN_CAPTION);
      if (data.category !== undefined) fields.category = normalizeCategory(data.category);
      if (data.inScene !== undefined) fields.inScene = String(data.inScene);
      if (data.who !== undefined) fields.who = cleanWho(data.who);
      if (data.slot !== undefined) fields.slot = normalizeForkWearSlot(data.slot);
      if (data.shows !== undefined) fields.shows = normalizeForkPinShows(data.shows);
      if (data.name !== undefined) fields.name = normalizeForkPinName(data.name);
      if (data.details !== undefined) {
        const current = await this.getById(id);
        fields.details = JSON.stringify(mergePinDetails(current?.details ?? {}, data.details));
      }
      if (data.order !== undefined && Number.isFinite(data.order)) fields.order = Math.trunc(data.order);
      await db
        .update(boardPins)
        .set(fields as never)
        .where(eq(boardPins.id, id));
      const pin = await this.getById(id);
      // Only a change that puts it in scene, or changes what it is, can make it replace another.
      if (
        pin &&
        (data.inScene === true || data.who !== undefined || data.slot !== undefined || data.category !== undefined)
      ) {
        await this.stepAsideFor(pin);
      }
      return pin;
    },

    async remove(id: string): Promise<void> {
      await db.delete(boardPins).where(eq(boardPins.id, id));
    },

    /** Every pin for a scope, with its pictures, so deleting a chat or persona leaves nothing behind. */
    async removeScope(scopeType: BoardScopeType, scopeId: string): Promise<string[]> {
      const pins = await this.listForScope(scopeType, scopeId);
      for (const pin of pins) await this.remove(pin.id);
      return pins.flatMap(pinImagePaths);
    },

    /**
     * Pins a reply should carry: the persona's, then this chat's in-scene pins and the ones that
     * follow the story into it. A place shows its day, night or rain picture when it has one.
     */
    async listForPrompt(chatId: string, personaId: string | null, now: BoardStoryNow = {}): Promise<BoardPin[]> {
      const [chatPins, personaPins] = await Promise.all([
        this.listForScope("chat", chatId),
        personaId ? this.listForScope("persona", personaId) : Promise.resolve([]),
      ]);
      const inChat = chatPins
        .filter((pin) => (pin.inScene || pinFollowsInto(pin, now, chatPins)) && vibeFits(pin, now))
        .map((pin) =>
          pin.category === "place"
            ? {
                ...pin,
                imagePath: forkPlaceLookFor(pin.details, pin.imagePath, {
                  night: now.night === true,
                  raining: now.raining === true,
                }),
              }
            : pin,
        );
      // A chat's outfit covers the persona board's always-on one for the same person and slot, so
      // the writer is never told two outfits at once. The persona board itself is left alone.
      const coveredByChat = (pin: BoardPin) =>
        pin.category === "wearing" &&
        Boolean(pin.who) &&
        inChat.some(
          (chatPin) =>
            chatPin.category === "wearing" &&
            chatPin.who === pin.who &&
            forkWearSlotsReplacedBy(chatPin.slot).includes(pin.slot as ForkWearSlot),
        );
      return [...personaPins.filter((pin) => pin.inScene && !coveredByChat(pin)), ...inChat];
    },

    /**
     * Pins that are not in scene but that a message mentions by caption ("her fluffy boots"), so
     * they ride along with that one reply.
     */
    async listMentioned(chatId: string, personaId: string | null, message: string): Promise<BoardPin[]> {
      if (!message.trim()) return [];
      const [chatPins, personaPins] = await Promise.all([
        this.listForScope("chat", chatId),
        personaId ? this.listForScope("persona", personaId) : Promise.resolve([]),
      ]);
      return [...personaPins, ...chatPins].filter(
        (pin) =>
          !pin.inScene &&
          ((pin.caption.trim() && forkMessageMentionsPin(message, pin.caption)) ||
            (pin.name && forkMessageMentionsPin(message, pin.name))),
      );
    },
  };
}
