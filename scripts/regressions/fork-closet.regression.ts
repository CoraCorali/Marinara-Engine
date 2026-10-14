/**
 * Fork: the closet. What a persona owns, what she has on, and what that sends to the model.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-closet-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const { closetItems, createClosetStorage, slotsReplacedBy, normalizeSlot, MAX_CLOSET_ITEMS_PER_PERSONA } =
  await import("../../packages/server/src/services/closet/fork-closet-items.js");
const { closetItemsAsImageEntries, wornOutfitLine } =
  await import("../../packages/server/src/services/generation/fork-closet-prompt.js");

const db = await getDB();
registerForkTables([closetItems]);
const closet = createClosetStorage(db);

const KYLI = "persona-kyli";
const add = (slot: string, label: string, wear = false) =>
  closet.create({ personaId: KYLI, slot, imagePath: `/api/lorebooks/entry-images/${label}.png`, label, wear });

// ── A wardrobe ──
const cami = await add("top", "cream cami", true);
const shorts = await add("bottom", "sleep shorts", true);
const chain = await add("jewellery", "gold chain", true);
assert.ok(cami && shorts && chain);
assert.equal((await closet.listForPersona(KYLI)).length, 3);
assert.equal((await closet.listWorn(KYLI)).length, 3, "three pieces on, none of them clashing");

// ── One piece per slot ──
const tee = await add("top", "brown tee", true);
const worn = await closet.listWorn(KYLI);
assert.deepEqual(
  worn.map((item) => item.label),
  ["brown tee", "sleep shorts", "gold chain"],
  "a second top replaces the first, and leaves the rest alone",
);
assert.equal((await closet.getById(cami!.id))!.worn, false, "the cami is off but still owned");
assert.equal((await closet.listForPersona(KYLI)).length, 4);

// ── A dress is not worn beside a top and a bottom ──
assert.deepEqual(slotsReplacedBy("dress").sort(), ["bottom", "dress", "top"]);
assert.deepEqual(slotsReplacedBy("top").sort(), ["dress", "top"]);
assert.deepEqual(slotsReplacedBy("shoes"), ["shoes"], "most slots replace only themselves");

const dress = await add("dress", "cream ruffle dress", true);
assert.deepEqual(
  (await closet.listWorn(KYLI)).map((item) => item.label),
  ["cream ruffle dress", "gold chain"],
  "the dress takes the place of both the top and the bottom, and the chain stays on",
);

// Putting a top back on takes the dress off again.
await closet.wear(tee!.id);
assert.deepEqual(
  (await closet.listWorn(KYLI)).map((item) => item.label),
  ["brown tee", "gold chain"],
  "a top replaces the dress, and does not bring the old bottom back by itself",
);
assert.equal((await closet.getById(dress!.id))!.worn, false);

// ── Taking something off keeps it ──
await closet.wear(shorts!.id);
await closet.takeOff(chain!.id);
const afterOff = await closet.listWorn(KYLI);
assert.ok(!afterOff.some((item) => item.label === "gold chain"));
assert.ok(
  (await closet.listForPersona(KYLI)).some((item) => item.label === "gold chain"),
  "still in the closet",
);

// ── Outfits read big pieces first ──
const boots = await add("shoes", "brown boots", true);
const bag = await add("bag", "hobo bag", true);
assert.ok(boots && bag);
assert.deepEqual(
  (await closet.listWorn(KYLI)).map((item) => item.slot),
  ["top", "bottom", "shoes", "bag"],
  "slot order, not the order they were added",
);

// ── What the model gets ──
const outfit = await closet.listWorn(KYLI);
const entries = closetItemsAsImageEntries(outfit);
assert.equal(entries.length, 4);
assert.equal(entries[0]!.name, "Wearing, on top: brown tee");
assert.equal(entries[2]!.name, "On her feet: brown boots");
assert.equal(entries[0]!.position, 2, "the same position lorebook reference images use");
assert.equal(entries[0]!.images[0]!.path, "/api/lorebooks/entry-images/brown tee.png");

assert.equal(wornOutfitLine(outfit, "Kyli"), "Kyli is wearing: brown tee, sleep shorts, brown boots, hobo bag.");
assert.equal(wornOutfitLine([], "Kyli"), "", "a persona with nothing on costs nothing");

// ── Another persona's closet is her own ──
await closet.create({ personaId: "persona-rion", slot: "top", imagePath: "/p.png", label: "black shirt", wear: true });
assert.equal((await closet.listForPersona("persona-rion")).length, 1);
assert.equal((await closet.listWorn(KYLI)).length, 4, "untouched");

// ── An unknown slot does not become a new slot ──
assert.equal(normalizeSlot("hat"), "extra");
assert.equal(normalizeSlot(undefined), "extra");

// ── The closet is capped ──
const FULL = "persona-full";
for (let index = 0; index < MAX_CLOSET_ITEMS_PER_PERSONA; index += 1) {
  await closet.create({ personaId: FULL, slot: "extra", imagePath: `/n${index}.png`, label: `thing ${index}` });
}
assert.equal((await closet.listForPersona(FULL)).length, MAX_CLOSET_ITEMS_PER_PERSONA);
assert.equal(
  await closet.create({ personaId: FULL, slot: "extra", imagePath: "/over.png", label: "one too many" }),
  null,
  "a full closet refuses another piece instead of growing without limit",
);

// ── Deleting a persona leaves nothing behind ──
const { removeForkCloset } = await import("../../packages/server/src/services/closet/fork-closet-cleanup.js");
const cleared = await closet.removePersona("persona-rion");
assert.deepEqual(cleared, ["/p.png"], "the pictures to delete come back");
assert.equal((await closet.listForPersona("persona-rion")).length, 0);
assert.equal((await closet.listForPersona(KYLI)).length, 7, "other closets are untouched");
// The wrapper tolerates a missing picture rather than blocking a delete.
await removeForkCloset(db, KYLI);
assert.equal((await closet.listForPersona(KYLI)).length, 0);
// Clearing a persona with no closet is harmless.
await removeForkCloset(db, "never-existed");

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork closet: ok");
