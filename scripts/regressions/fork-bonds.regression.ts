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
assert.ok(block.includes("Gia: Ex. unfinished middling, bitterness high."));
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

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork bonds: ok");
