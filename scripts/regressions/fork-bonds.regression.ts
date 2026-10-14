/**
 * Fork: the relationship tracker. Bonds are not all the same shape, so each kind tracks its own
 * two things, and a romance keeps its place on a ladder rather than being a kind of its own.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-bonds-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const { bonds, createBondsStorage, BOND_METERS, normalizeStage, clampMeter, MAX_BONDS_PER_CHAT } =
  await import("../../packages/server/src/services/bonds/fork-bonds.js");
const { bondsPromptBlock } = await import("../../packages/server/src/services/generation/fork-bonds-prompt.js");

const db = await getDB();
registerForkTables([bonds]);
const store = createBondsStorage(db);
const CHAT = "chat-vee";

// ── Each kind tracks its own two things ──
assert.deepEqual(BOND_METERS.love, ["wanting", "patience"]);
assert.deepEqual(BOND_METERS.family, ["closeness", "friction"]);
assert.deepEqual(BOND_METERS.rival, ["respect", "hostility"]);
assert.notDeepEqual(BOND_METERS.love, BOND_METERS.friend, "a friend is not scored like a love interest");

// ── A rung belongs to a romance and nothing else ──
assert.equal(normalizeStage("love", "engaged"), "engaged");
assert.equal(normalizeStage("love", "nonsense"), "talking", "an unknown rung starts at the bottom");
assert.equal(normalizeStage("love", undefined), "talking");
assert.equal(normalizeStage("friend", "engaged"), null, "a friend has no rung");
assert.equal(normalizeStage("family", "married"), null);

// ── Meters stay inside their range ──
assert.equal(clampMeter(140), 100);
assert.equal(clampMeter(-20), 0);
assert.equal(clampMeter("72"), 72);
assert.equal(clampMeter("not a number", 31), 31, "nonsense keeps what was there");

// ── A chat's bonds ──
const vee = await store.create({
  chatId: CHAT,
  characterId: "char-vee",
  kind: "love",
  stage: "living",
  first: 82,
  second: 34,
  note: "He is sulking about last night and has not said sorry.",
});
assert.ok(vee);
assert.equal(vee!.stage, "living");

const nessa = await store.create({ chatId: CHAT, characterId: "char-nessa", kind: "friend", first: 90, second: 88 });
const gia = await store.create({ chatId: CHAT, characterId: "char-gia", kind: "ex", first: 60, second: 70 });
assert.ok(nessa && gia);
assert.equal(nessa!.stage, null, "a friend never gets a rung");
assert.equal((await store.listForChat(CHAT)).length, 3);

// ── One bond per person ──
const again = await store.create({ chatId: CHAT, characterId: "char-vee", kind: "friend" });
assert.equal(again!.id, vee!.id, "a second bond with the same person returns the first instead of disagreeing with it");
assert.equal((await store.listForChat(CHAT)).length, 3);

// ── Boyfriend and husband are rungs, not kinds ──
await store.update(vee!.id, { stage: "married" });
assert.equal((await store.getById(vee!.id))!.stage, "married");

// Changing a romance into a friendship drops the rung; changing back starts it over.
await store.update(vee!.id, { kind: "friend" });
assert.equal((await store.getById(vee!.id))!.stage, null);
await store.update(vee!.id, { kind: "love" });
assert.equal((await store.getById(vee!.id))!.stage, "talking", "the old rung is not quietly restored");

// ── What the model is told ──
await store.update(vee!.id, { stage: "living", first: 82, second: 34 });
const names: Record<string, string> = { "char-vee": "Vee", "char-nessa": "Nessa", "char-gia": "Gia" };
const block = bondsPromptBlock(await store.listForChat(CHAT), (id) => names[id] ?? "", "Kyli");

assert.ok(block.startsWith("Where things stand between Kyli and"), "it says whose relationships these are");
assert.ok(block.includes("Vee: Romantic, living together."), "the rung reads as words");
assert.ok(block.includes("wanting high, patience low"), "meters read as words, not numbers");
assert.ok(block.includes("He is sulking"), "her own note goes through");
assert.ok(block.includes("Nessa: Friend. closeness very high, trust very high."), "a friend is scored as a friend");
// 60 is middling and 70 is high, by the thresholds the block itself uses.
assert.ok(block.includes("Gia: Ex. unfinished business middling, bitterness high."));
assert.ok(!/\b82\b|\b34\b/.test(block), "no bare numbers: a model reads 'running thin' better than 34");

// A chat that never opens the tracker costs nothing.
assert.equal(
  bondsPromptBlock([], () => "", "Kyli"),
  "",
);

// A bond with nobody named still reads sensibly.
const nameless = await store.create({ chatId: "chat-2", characterId: "char-ghost", kind: "rival" });
assert.ok(nameless);
assert.ok(bondsPromptBlock(await store.listForChat("chat-2"), () => "", "Kyli").includes("Someone: Rival."));
// A label stands in when the character is not one of the chat's cards.
await store.update(nameless!.id, { label: "the man at the door" });
assert.ok(
  bondsPromptBlock(await store.listForChat("chat-2"), () => "", "Kyli").includes("the man at the door: Rival."),
);

// ── What an agent's reading is allowed to do ──
const { planBondUpdates, MAX_METER_STEP } =
  await import("../../packages/server/src/services/bonds/fork-bond-updates.js");

const current = await store.listForChat(CHAT);
const byName: Record<string, string> = { Vee: "char-vee", Nessa: "char-nessa", Gia: "char-gia" };
const resolve = (name: string) => byName[name] ?? null;

// A relationship moves rather than teleports: one sharp line must not take patience from 34 to 0.
const crash = planBondUpdates({ bonds: [{ who: "Vee", first: 10, second: 0 }] }, current, resolve);
assert.equal(crash.changes.length, 1);
assert.equal(crash.changes[0]!.first, 82 - MAX_METER_STEP, "a fall is capped at one step");
assert.equal(crash.changes[0]!.second, 34 - MAX_METER_STEP);
assert.equal(crash.creations.length, 0);

// A romance moves one rung at a time. Nobody goes from living together to married in one reply.
const rush = planBondUpdates({ bonds: [{ who: "Vee", stage: "married" }] }, current, resolve);
assert.equal(rush.changes[0]!.stage, "engaged", "one rung, not four");

// A bond it does not mention is left alone.
assert.ok(!crash.changes.some((change) => change.id !== current.find((b) => b.characterId === "char-vee")!.id));

// A missing field never resets anything: no kind means the kind stays.
const quiet = planBondUpdates({ bonds: [{ who: "Nessa", note: "She knows about the fight." }] }, current, resolve);
assert.equal(quiet.changes[0]!.kind, undefined, "an unnamed kind is not a reset to 'other'");
assert.equal(quiet.changes[0]!.note, "She knows about the fight.");

// A kind it makes up is ignored rather than normalised into something it did not mean.
const nonsense = planBondUpdates({ bonds: [{ who: "Nessa", kind: "nemesis" }] }, current, resolve);
assert.equal(nonsense.changes.length, 0, "nothing in the update was usable, so nothing changes");

// Somebody new becomes a new bond rather than overwriting the nearest one.
const stranger = planBondUpdates({ bonds: [{ who: "the man at the door", kind: "rival" }] }, current, resolve);
assert.equal(stranger.changes.length, 0);
assert.equal(stranger.creations.length, 1);
assert.equal(stranger.creations[0]!.label, "the man at the door");
assert.equal(stranger.creations[0]!.first, 50, "a first impression starts in the middle, not at a measurement");
assert.ok(stranger.creations[0]!.characterId.startsWith("outsider-"));

// A new bond that IS a card in the chat is tied to that card.
const newCard = planBondUpdates({ bonds: [{ who: "Gia", kind: "ex" }] }, [], resolve);
assert.equal(newCard.creations[0]!.characterId, "char-gia");

// Naming the same person twice does not apply twice.
const twice = planBondUpdates(
  {
    bonds: [
      { who: "Vee", first: 90 },
      { who: "Vee", first: 95 },
    ],
  },
  current,
  resolve,
);
assert.equal(twice.changes.length, 1);
assert.equal(twice.creations.length, 0, "the second mention is not mistaken for a new person");

// Nothing, or rubbish, changes nothing.
assert.deepEqual(planBondUpdates(null, current, resolve), { changes: [], creations: [] });
assert.deepEqual(planBondUpdates({ bonds: "no" }, current, resolve), { changes: [], creations: [] });
assert.deepEqual(planBondUpdates({ bonds: [{ who: "   " }] }, current, resolve), { changes: [], creations: [] });

// ── The tracker is capped ──
for (let index = 0; index < MAX_BONDS_PER_CHAT; index += 1) {
  await store.create({ chatId: "chat-full", characterId: `char-${index}`, kind: "other" });
}
assert.equal((await store.listForChat("chat-full")).length, MAX_BONDS_PER_CHAT);
assert.equal(
  await store.create({ chatId: "chat-full", characterId: "char-extra", kind: "other" }),
  null,
  "a full tracker refuses another bond instead of growing without limit",
);

// ── Deleting a chat leaves nothing behind ──
await store.removeChat(CHAT);
assert.equal((await store.listForChat(CHAT)).length, 0);
assert.equal((await store.listForChat("chat-2")).length, 1, "other chats are untouched");

// ── A branch copies the relationships, and deleting a chat clears them ──
const { boardPins } = await import("../../packages/server/src/services/board/fork-board-pins.js");
registerForkTables([boardPins]);
const { copyForkChatData, removeForkChatData } = await import("../../packages/server/src/services/fork-chat-data.js");
await store.create({
  chatId: "branch-src",
  characterId: "char-x",
  label: "Theo",
  kind: "love",
  stage: "dating",
  first: 70,
  second: 40,
  note: "Raw after the fight.",
});
await copyForkChatData(db, "branch-src", "branch-new");
const copied = await store.listForChat("branch-new");
assert.equal(copied.length, 1, "the branch has the bond");
assert.equal(copied[0]!.stage, "dating");
assert.equal(copied[0]!.first, 70);
assert.equal(copied[0]!.note, "Raw after the fight.");
assert.notEqual(copied[0]!.id, (await store.listForChat("branch-src"))[0]!.id, "a copy, not the same row");
await removeForkChatData(db, "branch-new");
assert.equal((await store.listForChat("branch-new")).length, 0, "deleting the branch clears its bonds");
assert.equal((await store.listForChat("branch-src")).length, 1, "and leaves the source alone");

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork bonds: ok");
