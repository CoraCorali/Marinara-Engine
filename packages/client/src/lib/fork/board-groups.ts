// ──────────────────────────────────────────────
// Fork: how the board groups pins and what it says on them (see FORK.md)
// ──────────────────────────────────────────────
// Kept out of the component so the rules can be checked without a browser: which building a place
// belongs under, whose things these are, which place the story is standing in, and the little
// badges a polaroid wears. Nothing here reads React or the network.
import {
  FORK_THING_AT_PLACE,
  FORK_THING_LOST,
  forkPlaceMatchesLocation,
  type ForkPinDetails,
} from "@marinara-engine/shared";

/** The shape these helpers need; a BoardPin satisfies it. */
export type ForkBoardPinLike = {
  id: string;
  category: string;
  name: string;
  caption: string;
  details: ForkPinDetails;
};

export type ForkBoardGroup = {
  key: string;
  /** A building's or an owner's name; "" when the group is the leftovers. */
  title: string;
  kind: "building" | "owner" | "shared";
  pins: ForkBoardPinLike[];
};

export type ForkPinBadge = {
  key: string;
  values?: Record<string, string | number>;
  /** The one badge that reads as a warning rather than a note. */
  warn?: boolean;
};

export type ForkBoardFilter = "all" | "wearing" | "place" | "thing" | "person" | "vibe";

/** The categories the filter offers, in the order the chips sit. */
export const FORK_BOARD_FILTERS: readonly ForkBoardFilter[] = ["all", "wearing", "place", "thing", "person", "vibe"];

export const FORK_BOARD_FILTER_LABEL_KEYS: Record<ForkBoardFilter, string> = {
  all: "ui.chat.forkboard.filterAll",
  wearing: "ui.chat.forkboard.filterWearing",
  place: "ui.chat.forkboard.filterPlaces",
  thing: "ui.chat.forkboard.filterThings",
  person: "ui.chat.forkboard.filterPeople",
  vibe: "ui.chat.forkboard.filterVibes",
};

/** Only places and things are worth grouping; the rest read fine as one grid. */
export function forkBoardGroups(pins: readonly ForkBoardPinLike[], filter: ForkBoardFilter): ForkBoardGroup[] | null {
  if (filter === "place") {
    const groups: ForkBoardGroup[] = [];
    // Only places group by building; anything else handed in is not this shelf's business.
    for (const pin of pins.filter((entry) => entry.category === "place")) {
      const building = pin.name.trim();
      // Rooms of one building share a group; a place with no building name has its own, at the end.
      const key = building ? `building:${building.toLowerCase()}` : "building:";
      let group = groups.find((entry) => entry.key === key);
      if (!group) {
        group = { key, title: building, kind: "building", pins: [] };
        groups.push(group);
      }
      group.pins.push(pin);
    }
    // A named building is more useful than the leftovers, so it comes first.
    return groups.sort((left, right) => Number(Boolean(right.title)) - Number(Boolean(left.title)));
  }
  if (filter === "thing") {
    const groups: ForkBoardGroup[] = [];
    // Only things group by owner.
    for (const pin of pins.filter((entry) => entry.category === "thing")) {
      const owner = (pin.details.owner ?? "").trim();
      const key = owner ? `owner:${owner}` : "owner:";
      let group = groups.find((entry) => entry.key === key);
      if (!group) {
        group = { key, title: owner, kind: owner ? "owner" : "shared", pins: [] };
        groups.push(group);
      }
      group.pins.push(pin);
    }
    return groups.sort((left, right) => Number(left.kind === "shared") - Number(right.kind === "shared"));
  }
  return null;
}

/** The places the story is standing in right now, by pin id. */
export function forkHerePlaceIds(pins: readonly ForkBoardPinLike[], location: string | null | undefined): Set<string> {
  const here = new Set<string>();
  if (!location?.trim()) return here;
  for (const pin of pins) {
    if (pin.category !== "place") continue;
    if (forkPlaceMatchesLocation(location, pin.name, pin.details.room ?? "")) here.add(pin.id);
  }
  return here;
}

/**
 * A thing is with someone else when its holder is a person who is not its owner. A holder that is
 * "lost" or a place has its own line in the story, not a "has it" badge.
 */
export function forkThingHeldByOther(pin: ForkBoardPinLike): boolean {
  const holder = (pin.details.holder ?? "").trim();
  if (!holder || holder === FORK_THING_LOST || holder.startsWith(FORK_THING_AT_PLACE)) return false;
  return holder !== (pin.details.owner ?? "").trim();
}

/**
 * Who the thing was a gift from, when the story says so.
 *
 * ponytail: this reads the gift out of a feeling's or a memory's words rather than storing it, so a
 * thing given without the word "gift", "gave" or "handed down" shows no badge. Give the pin its own
 * `from` field if this ever needs to be exact.
 */
export function forkThingGiftFrom(pin: ForkBoardPinLike): string {
  if (pin.category !== "thing") return "";
  const owner = (pin.details.owner ?? "").trim();
  const lines = [
    ...(pin.details.feelings ?? []).map((feeling) => ({ who: feeling.who, text: feeling.text })),
    ...(pin.details.memories ?? []).map((memory) => ({ who: "", text: memory.text })),
  ];
  const gift = lines.find((line) => /\b(gift|gave|given|handed down)\b/i.test(line.text));
  if (!gift) return "";
  const who = gift.who.trim();
  return who && who !== owner ? who : "";
}

/**
 * The things the persona is carrying, by the name a card would show: a thing whose holder is the
 * persona. Used by the persona card's Holding list, so a board thing shows up with what you have on.
 */
export function forkHeldThingNames(pins: readonly ForkBoardPinLike[]): string[] {
  return pins
    .filter((pin) => pin.category === "thing" && (pin.details.holder ?? "").trim() === "persona")
    .map((pin) => pin.name.trim() || pin.caption.trim())
    .filter(Boolean);
}

/** The little notes a polaroid wears, in the order they read best. */
export function forkPinBadges(
  pin: ForkBoardPinLike,
  context: { here: boolean; nameFor: (id: string) => string },
): ForkPinBadge[] {
  const details = pin.details ?? {};
  const badges: ForkPinBadge[] = [];
  if (pin.category === "place" && context.here) badges.push({ key: "ui.chat.forkboard.badgeHere" });
  const status = (details.status ?? "").trim();
  if (pin.category === "thing" && status) {
    badges.push({ key: "ui.chat.forkboard.badgeStatus", values: { status }, warn: true });
  }
  if (details.important === true) badges.push({ key: "ui.chat.forkboard.badgeImportant" });
  const giftFrom = forkThingGiftFrom(pin);
  if (giftFrom) {
    badges.push({ key: "ui.chat.forkboard.badgeFrom", values: { name: context.nameFor(giftFrom) || giftFrom } });
  }
  if (forkThingHeldByOther(pin)) badges.push({ key: "ui.chat.forkboard.badgeHasIt" });
  return badges;
}

/**
 * Hand reordering saves `order` 0, 1, 2… for the pins on screen, so it is only safe when every pin
 * is on screen: the unfiltered, ungrouped board in its own order.
 */
export function forkBoardCanReorder(sort: string, filter: ForkBoardFilter, grouped: boolean): boolean {
  return sort === "mine" && filter === "all" && !grouped;
}

/** A person pin links to a character card: the chat's cast, never the persona. */
export function forkCardLinkOptions(cast: readonly { id: string; name: string }[]): { id: string; label: string }[] {
  return cast.map((member) => ({ id: member.id, label: member.name }));
}
