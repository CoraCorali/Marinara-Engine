/**
 * Fork: how the board groups pins and what it writes on them.
 *
 * The board's shelf groups places by building and things by whose they are, marks the place the
 * story is standing in, and gives a thing a short badge for what is going on with it. All of that
 * is decided in `lib/fork/board-groups.ts` so it can be checked here, without a browser: which
 * group a pin lands in, which order the groups read in, and that a holder who is not the owner
 * earns "has it" while a lost or left-behind thing does not.
 */
import assert from "node:assert/strict";

const {
  FORK_BOARD_FILTERS,
  forkBoardGroups,
  forkHeldThingNames,
  forkHerePlaceIds,
  forkPinBadges,
  forkThingGiftFrom,
  forkThingHeldByOther,
} = await import("../../packages/client/src/lib/fork/board-groups.js");

let nextId = 0;
const pin = (over = {}) => ({
  id: `p${++nextId}`,
  category: "thing",
  name: "",
  caption: "",
  details: {},
  ...over,
});

const loc = (location, place) => forkHerePlaceIds([place], location);

// ── Places group by building, with the named ones first ──
const kitchen = pin({ category: "place", name: "Theo's apartment", caption: "narrow kitchen", details: { room: "kitchen" } });
const bedroom = pin({ category: "place", name: "Theo's apartment", caption: "soft bedroom", details: { room: "bedroom" } });
const bakery = pin({ category: "place", name: "the bakery", caption: "warm light" });
const nowhere = pin({ category: "place", name: "", caption: "a place with no name" });
const places = forkBoardGroups([kitchen, bedroom, bakery, nowhere], "place");
assert.equal(places.length, 3, "two rooms share one building group; the unnamed place gets its own");
assert.deepEqual(
  places.map((group) => [group.title, group.pins.length]),
  [
    ["Theo's apartment", 2],
    ["the bakery", 1],
    ["", 1],
  ],
  "a named building comes before the leftovers, and rooms sit under their building",
);
assert.ok(
  places.every((group) => group.key !== places[0].key || group === places[0]),
  "each building has one distinct group key",
);

// Grouping is by category: a "thing" shelf given only places has nothing to shelf, and a filter
// that does not group at all returns null so the board draws one flat grid.
assert.deepEqual(forkBoardGroups([kitchen, bakery], "thing"), [], "a things shelf ignores places");
assert.equal(forkBoardGroups([kitchen, bakery], "person"), null, "people are not grouped at all");
assert.equal(forkBoardGroups([kitchen, bakery], "all"), null, "the unfiltered board is not grouped");
assert.deepEqual(
  forkBoardGroups([kitchen, kitchen], "place").map((group) => group.pins.length),
  [2],
  "the same building still collapses to one group",
);

// ── Things group by owner, shared last ──
const mine = pin({ category: "thing", name: "Peaches", caption: "the car", details: { owner: "persona" } });
const shared = pin({ category: "thing", name: "mixtape", caption: "", details: {} });
const theos = pin({ category: "thing", name: "guitar", caption: "", details: { owner: "char-theo" } });
assert.deepEqual(
  forkBoardGroups([theos, shared, mine], "thing").map((group) => group.kind),
  ["owner", "owner", "shared"],
  "shared and ownerless things read together, after the named owners",
);
assert.deepEqual(
  forkBoardGroups([shared], "thing").map((group) => group.title),
  [""],
  "an ownerless group has no name of its own; the label comes from the catalog",
);

// ── Which place the story is standing in ──
assert.deepEqual([...loc("Theo's apartment · kitchen", kitchen)], [kitchen.id], "the room must match too");
assert.equal(loc("Theo's apartment · bedroom", kitchen).size, 0, "the same building, a different room");
assert.equal(loc("Theo's apartment · kitchen", bedroom).size, 0);
assert.equal(loc("the bakery", bakery).size, 1, "a place named in the location is here");
assert.equal(loc("", kitchen).size, 0, "no location recorded is nowhere");
assert.equal(
  forkHerePlaceIds([theos], "the bakery").size,
  0,
  "only places can be the place the story is in",
);

// ── Owner and holder are two different things ──
const borrowed = pin({ category: "thing", name: "umbrella", details: { owner: "char-theo", holder: "persona" } });
const lost = pin({ category: "thing", name: "ring", details: { owner: "persona", holder: "lost" } });
const leftAt = pin({ category: "thing", name: "hoodie", details: { owner: "persona", holder: "place:p9" } });
const atHome = pin({ category: "thing", name: "mug", details: { owner: "persona", holder: "persona" } });
assert.equal(forkThingHeldByOther(borrowed), true, "someone who is not the owner has it");
assert.equal(forkThingHeldByOther(atHome), false, "the owner holding their own thing is not news");
assert.equal(forkThingHeldByOther(lost), false, "lost is not 'has it'");
assert.equal(forkThingHeldByOther(leftAt), false, "left at a place is not 'has it'");
assert.equal(
  forkThingHeldByOther(pin({ category: "thing", details: { owner: "", holder: "persona" } })),
  true,
  "a thing nobody owns, held by the persona, is with someone else",
);

// ── Holding: the persona's own thing shows on the card ──
assert.deepEqual(
  forkHeldThingNames([borrowed, atHome, theos, lost]),
  ["umbrella", "mug"],
  "anything whose holder is the persona, whether she owns it or borrowed it; a lost thing counts for none",
);
assert.deepEqual(
  forkHeldThingNames([pin({ category: "thing", caption: "a keyring", details: { holder: "persona" } })]),
  ["a keyring"],
  "a thing with no name falls back to its caption",
);

// ── Gifts are read out of the story's own words ──
assert.equal(
  forkThingGiftFrom(
    pin({
      category: "thing",
      details: { owner: "persona", feelings: [{ who: "char-theo", text: "gave it to her for her birthday" }] },
    }),
  ),
  "char-theo",
  "a feeling that says who gave it names the giver",
);
assert.equal(
  forkThingGiftFrom(
    pin({ category: "thing", details: { memories: [{ chapter: 2, text: "A gift from Theo, handed down from his mother." }] } }),
  ),
  "",
  "a memory has no author to name, so the badge stays off",
);
assert.equal(
  forkThingGiftFrom(pin({ category: "thing", details: { owner: "char-theo", feelings: [{ who: "char-theo", text: "gave it to her" }] } })),
  "",
  "the owner giving their own thing is not a gift from someone else",
);
assert.equal(forkThingGiftFrom(pin({ category: "place" })), "", "only things get the gift line");

// ── Badges, in the order they read ──
const nameFor = (id) => (id === "char-theo" ? "Theo" : id);
const badges = (entry, here = false) => forkPinBadges(entry, { here, nameFor }).map((badge) => badge.key);
assert.deepEqual(badges(kitchen, true), ["ui.chat.forkboard.badgeHere"], "here only on a place, where it matters");
assert.deepEqual(badges(kitchen, false), []);
assert.deepEqual(
  badges(pin({ category: "thing", details: { status: "low on gas", important: true, owner: "char-theo", holder: "persona" } })),
  [
    "ui.chat.forkboard.badgeStatus",
    "ui.chat.forkboard.badgeImportant",
    "ui.chat.forkboard.badgeHasIt",
  ],
  "status, then ★, then has it",
);
assert.deepEqual(
  forkPinBadges(
    pin({ category: "thing", details: { owner: "persona", feelings: [{ who: "char-theo", text: "gave it as a gift" }] } }),
    { here: false, nameFor },
  ).map((badge) => [badge.key, badge.values]),
  [["ui.chat.forkboard.badgeFrom", { name: "Theo" }]],
  "a gift badge carries the giver's name",
);

// ── The filter list is the chips, in order ──
assert.deepEqual([...FORK_BOARD_FILTERS], ["all", "wearing", "place", "thing", "person", "vibe"]);

console.log("fork board grouping: ok");
