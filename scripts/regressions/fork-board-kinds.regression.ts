/**
 * Fork: places, things, people and vibes on the board. Places come in when the story is there and
 * show their night or rain picture; people when present; things with whoever has them; a chapter
 * vibe only in its chapter. The relationship tracker keeps things up to date, a swipe takes that
 * back, and a chapter recap leaves memories on the things it names.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-board-kinds-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const shared = await import("../../packages/shared/src/features/fork-pin-details.js");
const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const { boardPins, createBoardPinsStorage, mergePinDetails, pinImagePaths } =
  await import("../../packages/server/src/services/board/fork-board-pins.js");
const { boardPinsNoteLine, pinsForReply } =
  await import("../../packages/server/src/services/generation/fork-board-prompt.js");
const { bonds, bondMoments, bondTurns } = await import("../../packages/server/src/services/bonds/fork-bonds.js");
const { bondPairs } = await import("../../packages/server/src/services/bonds/fork-bond-pairs.js");
const { applyBondsAgentResult, undoBondTurn, loadBondsAgentState, bondsAgentFormatBlock } =
  await import("../../packages/server/src/services/bonds/fork-bond-updates.js");
const { rememberThingsFromRecap } = await import("../../packages/server/src/services/board/fork-thing-updates.js");
const { listRecentBondChanges } = await import("../../packages/server/src/services/bonds/fork-bond-recent.js");

const db = await getDB();
registerForkTables([boardPins, bonds, bondMoments, bondTurns, bondPairs]);
const pins = createBoardPinsStorage(db);
const img = (name: string) => `/api/lorebooks/entry-images/${name}.png`;

// ── The shared shape ──
assert.deepEqual(shared.normalizeForkPinDetails("not json"), {});
assert.deepEqual(
  shared.normalizeForkPinDetails({ palette: ["#AABBCC", "red", "#123"], words: ["cozy", "cozy", " "] }),
  {
    palette: ["#aabbcc"],
    words: ["cozy"],
  },
);
assert.equal(shared.forkPinFollowsStory("place", {}), true, "places follow the story unless switched off");
assert.equal(shared.forkPinFollowsStory("thing", {}), false, "things only when switched on");
assert.equal(shared.forkPlaceMatchesLocation("Theo's apartment · kitchen", "Theo's apartment", "kitchen"), true);
assert.equal(shared.forkPlaceMatchesLocation("Theo's apartment · bedroom", "Theo's apartment", "kitchen"), false);
assert.equal(shared.forkPlaceMatchesLocation("The bakery", "Theo's apartment"), false);
assert.equal(shared.forkStoryIsNight("11:00 PM"), true);
assert.equal(shared.forkStoryIsNight("2:30 pm"), false);
assert.equal(shared.forkStoryIsNight("late evening"), true);
assert.equal(shared.forkStoryIsRaining("Thunderstorm"), true);
assert.equal(shared.forkStoryIsRaining("Clear, cold"), false);
assert.deepEqual(mergePinDetails({ status: "a", important: true }, { status: "", owner: "persona" }), {
  owner: "persona",
  important: true,
});

// ── A place, with a night picture ──
const kitchen = (await pins.create({
  scopeType: "chat",
  scopeId: "c1",
  imagePath: img("kitchen-day"),
  caption: "narrow kitchen, flour on the counter",
  category: "place",
  name: "Theo's apartment",
  details: { room: "kitchen", album: [{ path: img("kitchen-night"), look: "night" }] },
  inScene: false,
}))!;
assert.equal(kitchen.name, "Theo's apartment");
assert.deepEqual(pinImagePaths(kitchen), [img("kitchen-day"), img("kitchen-night")], "deleting a pin finds its album");

// ── A person without a card ──
await pins.create({
  scopeType: "chat",
  scopeId: "c1",
  imagePath: img("gia"),
  category: "person",
  name: "Gia",
  details: { role: "Theo's mom" },
  inScene: false,
});

// ── A thing, with whoever has it ──
const umbrella = (await pins.create({
  scopeType: "chat",
  scopeId: "c1",
  imagePath: img("umbrella"),
  caption: "navy umbrella, one bent spoke",
  category: "thing",
  name: "navy umbrella",
  details: { owner: "char-theo", holder: "persona", followStory: true, important: true, status: "dripping" },
  inScene: false,
}))!;

// ── Two vibes: one for chapter 1, one for the whole story ──
await pins.create({
  scopeType: "chat",
  scopeId: "c1",
  imagePath: img("vibe1"),
  category: "vibe",
  details: { span: "chapter", chapter: 1, words: ["rainy"], palette: ["#2b1838"] },
});
await pins.create({
  scopeType: "chat",
  scopeId: "c1",
  imagePath: img("vibe2"),
  category: "vibe",
  details: { words: ["slow burn"] },
});

const night = {
  location: "Theo's apartment · kitchen",
  night: true,
  presentIds: ["persona"],
  presentNames: ["Kyli"],
  chapter: 2,
};
let scene = await pins.listForPrompt("c1", null, night);
const ids = (list: { name: string; category: string }[]) => list.map((pin) => `${pin.category}:${pin.name}`);
assert.deepEqual(
  ids(scene),
  ["place:Theo's apartment", "thing:navy umbrella", "vibe:"],
  "the place, her umbrella, the story vibe",
);
assert.equal(scene[0]!.imagePath, img("kitchen-night"), "at night a place shows its night picture");
scene = await pins.listForPrompt("c1", null, {
  ...night,
  location: "The bakery",
  night: false,
  presentNames: ["Kyli", "Gia"],
  chapter: 1,
});
assert.deepEqual(
  ids(scene),
  ["person:Gia", "thing:navy umbrella", "vibe:", "vibe:"],
  "away from the kitchen it stays out; Gia comes in when present; chapter 1 has its vibe",
);
assert.equal(
  (await pins.listForPrompt("c1", null, {})).length,
  2,
  "without a story the vibes still go, nothing follows",
);

// Words for the writer.
const note = boardPinsNoteLine(await pins.listForPrompt("c1", null, night), (who) =>
  who === "persona" ? "Kyli" : who === "char-theo" ? "Theo" : "",
);
assert.match(note, /Place, Theo's apartment › kitchen: narrow kitchen/);
assert.match(
  note,
  /Thing, navy umbrella, belongs to Theo, Kyli has it now, right now: dripping, important: a planted detail/,
);
assert.match(note, /The mood \(tone only, never literal objects in the scene\), mood words: slow burn/);
assert.match(note, /never move its furniture/);

// A mention of a pin that already followed in does not send it twice.
assert.equal(pinsForReply(scene, [scene[1]!]).length, scene.length);
assert.equal((await pins.listMentioned("c1", null, "Gia waves from the door")).length, 1, "names count as mentions");

// ── The tracker keeps things up to date ──
const block = await loadBondsAgentState(db, "c1", (id) => (id === "char-theo" ? "Theo" : ""), null, "Kyli");
assert.match(block, /<current_things>[\s\S]*"name":"navy umbrella","now":"dripping","with":"Kyli"/);
assert.match(bondsAgentFormatBlock(), /Optional "things"/);
const resolve = (name: string) => (name.toLowerCase() === "theo" ? "char-theo" : null);
await applyBondsAgentResult(
  db,
  "c1",
  { things: [{ name: "Navy Umbrella", now: "drying by the door", with: "Theo" }] },
  resolve,
  "m1",
  "Kyli",
);
let fresh = (await pins.getById(umbrella.id))!;
assert.equal(fresh.details.status, "drying by the door");
assert.equal(fresh.details.holder, "char-theo");
await applyBondsAgentResult(
  db,
  "c1",
  { things: [{ name: "navy umbrella", with: "Theo's apartment" }] },
  resolve,
  "m2",
  "Kyli",
);
assert.equal((await pins.getById(umbrella.id))!.details.holder, `place:${kitchen.id}`, "left at a place by its name");
assert.equal(
  (await listRecentBondChanges(db, "c1", ["m1", "m2"])).length,
  0,
  "a thing's change is not a relationship's",
);
// A swipe of m2 sees the umbrella as it was before m2, then takes m2's change back.
assert.match(
  await loadBondsAgentState(db, "c1", (id) => (id === "char-theo" ? "Theo" : ""), "m2", "Kyli"),
  /"with":"Theo"/,
);
await undoBondTurn(db, "c1", "m2");
fresh = (await pins.getById(umbrella.id))!;
assert.equal(fresh.details.holder, "char-theo", "a swipe takes the move back");
assert.equal(fresh.details.status, "drying by the door", "and leaves the earlier reply's");
await applyBondsAgentResult(db, "c1", { things: [{ name: "unknown thing", now: "x" }] }, resolve, "m3", "Kyli");

// ── A recap leaves a memory ──
await rememberThingsFromRecap(
  db,
  "c1",
  2,
  "## What happened\nThe storm broke. Theo lent Kyli his navy umbrella and walked her home. They laughed.\n\n## Open threads\n- the navy umbrella",
);
fresh = (await pins.getById(umbrella.id))!;
assert.deepEqual(fresh.details.memories, [
  { chapter: 2, text: "Theo lent Kyli his navy umbrella and walked her home." },
]);
await rememberThingsFromRecap(db, "c1", 2, "## What happened\nNothing about it.");
assert.equal(
  (await pins.getById(umbrella.id))!.details.memories,
  undefined,
  "a fresh recap without it drops that memory",
);

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork board kinds: ok");
