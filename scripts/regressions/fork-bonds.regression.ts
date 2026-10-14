/**
 * Fork: the relationship tracker. A love interest follows Pura's dating-sim route told in words, and
 * every other kind of bond has its own ladder and fields. Moving a rung or a status keeps a moment.
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

const shared = await import("../../packages/shared/src/features/fork-bond-shapes.js");
const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const { bonds, bondMoments, bondTurns, createBondsStorage, describeMoves, toBond, MAX_BONDS_PER_CHAT } =
  await import("../../packages/server/src/services/bonds/fork-bonds.js");
const { bondsPromptBlock } = await import("../../packages/server/src/services/generation/fork-bonds-prompt.js");
const { planBondUpdates, bondsAgentStateBlock, outsiderId, applyBondsAgentResult, listBondsBeforeTurn, undoBondTurn } =
  await import("../../packages/server/src/services/bonds/fork-bond-updates.js");

// ── The shapes ──
const { stepForkBondRung: step, forkBondRungDirection: direction } = shared;
assert.equal(step("love", "Close", "Devoted"), "Confidant", "one rung per scene on the same ladder");
assert.equal(step("love", "Confidant", "Close"), "Close", "and one rung down");
assert.equal(step("love", "Devoted", "Nemesis"), "Wary", "falling out lands on the cold ladder's first rung");
assert.equal(step("love", "Hostile", "Intimate"), "Stranger", "mending lands on the warm ladder's first rung");
assert.equal(step("love", "Familiar", "Unrequited"), "Unrequited", "a tangled state is named directly");
assert.equal(direction("love", "Close", "Confidant"), 1);
assert.equal(direction("love", "Close", "Friendly"), -1);
assert.equal(direction("love", "Wary", "Guarded"), -1, "climbing the cold ladder is moving away");
assert.equal(direction("love", "Guarded", "Stranger"), 1, "leaving the cold ladder is warming");
assert.equal(direction("rival", "Rival", "Nemesis"), -1, "a rivalry heading for Nemesis is moving away");
assert.equal(direction("love", "Close", "Complicated"), 0);
assert.equal(shared.normalizeForkBondRung("love", "  confidant "), "Confidant");
assert.equal(shared.normalizeForkBondRung("family", "Devoted"), null, "a sister has no Devoted rung");
assert.equal(shared.normalizeForkBondCondition("volatile"), "⚡ VOLATILE", "a condition matches by its word");
assert.equal(shared.normalizeForkBondDrift("🍂 cooling"), "🍂 COOLING");
assert.equal(shared.normalizeForkBondCondition("happy"), null);
assert.ok(shared.FORK_BOND_SHAPES.love.fields.includes("date"));
assert.ok(!shared.FORK_BOND_SHAPES.family.fields.includes("date"), "family is never asked for a date idea");
assert.deepEqual(shared.forkBondNeighbours("love", "Close"), { below: "Friendly", above: "Confidant" });
assert.deepEqual(shared.forkBondNeighbours("love", "Unrequited"), { below: null, above: null });

const db = await getDB();
registerForkTables([bonds, bondMoments, bondTurns]);
const store = createBondsStorage(db);
const CHAT = "chat-vee";

// ── A chat's bonds ──
const vee = await store.create({
  chatId: CHAT,
  characterId: "char-vee",
  kind: "love",
  status: "living",
  rung: "close",
  route: "🌱 Slow Burn",
  condition: "shifting",
  fields: { heart: "Hovers in the doorway instead of coming in.", trust: "Her keys.", date: "", madeUp: "dropped" },
});
assert.ok(vee);
assert.equal(vee!.status, "living");
assert.equal(vee!.rung, "Close", "a rung is stored the way its ladder spells it");
assert.equal(vee!.condition, "💛 SHIFTING");
assert.deepEqual(
  vee!.fields,
  { heart: "Hovers in the doorway instead of coming in.", trust: "Her keys." },
  "only real, non-empty fields",
);

const nessa = await store.create({ chatId: CHAT, characterId: "char-nessa", kind: "friend", status: "married" });
const gia = await store.create({ chatId: CHAT, characterId: "char-gia", kind: "ex" });
assert.ok(nessa && gia);
assert.equal(nessa!.status, null, "a friend never gets a status");
assert.equal(nessa!.rung, "Acquaintance", "a new bond starts on its ladder's first rung");
assert.equal(gia!.rung, "Bitter");
assert.equal((await store.listForChat(CHAT)).length, 3);

// One bond per person.
const again = await store.create({ chatId: CHAT, characterId: "char-vee", kind: "friend" });
assert.equal(again!.id, vee!.id, "a second bond with the same person returns the first instead of disagreeing with it");

// Fields merge; an empty string clears one.
await store.update(nessa!.id, { fields: { vibe: "Bickers like siblings.", joke: "the goose" } });
await store.update(nessa!.id, { fields: { joke: "" } });
assert.deepEqual((await store.getById(nessa!.id))!.fields, { vibe: "Bickers like siblings." });

// Changing a romance into a friendship drops its status and rung; changing back starts over.
await store.update(vee!.id, { kind: "friend" });
const asFriend = (await store.getById(vee!.id))!;
assert.equal(asFriend.status, null);
assert.equal(asFriend.route, "", "a friendship has no romance route");
assert.equal(asFriend.fields.trust, "Her keys.", "a field both kinds have stays");
assert.equal(asFriend.fields.heart, undefined, "a field a friend does not have goes");
await store.update(vee!.id, { kind: "love" });
const backToLove = (await store.getById(vee!.id))!;
assert.equal(backToLove.status, "talking", "the old status is not quietly restored");
assert.equal(backToLove.rung, "Stranger");

// ── A bond from the first version keeps its note ──
const legacy = toBond({
  id: "old",
  chatId: "c",
  characterId: "x",
  label: "",
  kind: "love",
  stage: "dating",
  note: "Sulking about last night.",
  order: 0,
  createdAt: "",
  updatedAt: "",
});
assert.equal(legacy.fields.heart, "Sulking about last night.", "the old note becomes the heart");
assert.equal(legacy.rung, "Close", "a first-version romance keeps how far it had got");
const oldRow = {
  id: "o",
  chatId: "c",
  characterId: "y",
  label: "",
  stage: "",
  note: "",
  order: 0,
  createdAt: "",
  updatedAt: "",
};
assert.equal(toBond({ ...oldRow, kind: "love", stage: "married" }).rung, "Devoted", "a husband is not a Stranger");
assert.equal(
  toBond({ ...oldRow, kind: "friend", first: 90 }).rung,
  "Ride-or-die",
  "an old friend's closeness carries over",
);
assert.equal(toBond({ ...oldRow, kind: "ex", second: 100 }).rung, "Bitter", "an old ex's bitterness carries over");
assert.equal(
  toBond({ ...oldRow, kind: "love", stage: "married", rung: "Wary" }).rung,
  "Wary",
  "a saved rung always wins over the old stage",
);

// ── Models write words their own way ──
assert.equal(shared.normalizeForkBondKind(" Love "), "love");
assert.equal(shared.normalizeForkLoveStatus("love", "MARRIED"), "married");
assert.equal(shared.readForkBondKind("soulmate"), null);
assert.notEqual(outsiderId("さくら"), outsiderId("ひなた"), "names in any script stay apart");
assert.equal(outsiderId("Old Tom!"), "outsider-old-tom");
assert.equal(outsiderId("  ???  "), "outsider-someone");

// ── Moments ──
const before = (await store.getById(vee!.id))!;
const after = (await store.update(vee!.id, { rung: "Noticed", status: "dating" }))!;
const moves = describeMoves(before, after);
assert.deepEqual(moves, [
  { from: "Stranger", to: "Noticed" },
  { from: "talking", to: "dating" },
]);
for (const move of moves) await store.addMoment({ bondId: vee!.id, chatId: CHAT, ...move, text: "The roof." });
assert.equal((await store.listMomentsForChat(CHAT)).length, 2);
assert.deepEqual(
  describeMoves(after, (await store.update(vee!.id, { kind: "rival" }))!),
  [],
  "a change of kind is not a move",
);
await store.update(vee!.id, { kind: "love", status: "living", rung: "Close", route: "🌱 Slow Burn" });

// ── What the model is told ──
await store.update(vee!.id, {
  condition: "volatile",
  drift: "cooling",
  fields: { trust: "Not with the money.", want: "An apology first.", memory: "The roof: she stayed.", turn: "x" },
});
const names: Record<string, string> = { "char-vee": "Vee", "char-nessa": "Nessa", "char-gia": "Gia" };
const block = bondsPromptBlock(await store.listForChat(CHAT), (id) => names[id] ?? "", "Kyli");
assert.ok(block.startsWith("Where things stand between Kyli and"), "it says whose relationships these are");
assert.ok(
  block.includes("- Vee (love interest, living together, route 🌱 Slow Burn): Close · ⚡ VOLATILE · 🍂 COOLING"),
  "rung, condition and drift read as words",
);
assert.ok(block.includes("  Trust: Not with the money."));
assert.ok(block.includes("  Wants: An apology first."));
assert.ok(!block.includes("The roof"), "the keepsake memory is for the card, not the writer");
assert.ok(block.includes("- Nessa (friend): Acquaintance"));
assert.ok(block.includes("  Vibe: Bickers like siblings."));
assert.ok(block.includes("- Gia (ex): Bitter"));
assert.ok(!/\b\d{2}\b/.test(block), "no numbers");
assert.equal(
  bondsPromptBlock([], () => "", "Kyli"),
  "",
  "a chat that never opens the tracker costs nothing",
);

// ── What an agent's reading is allowed to do ──
const current = await store.listForChat(CHAT);
const veeId = current.find((bond) => bond.characterId === "char-vee")!.id;
const byName: Record<string, string> = { Vee: "char-vee", Nessa: "char-nessa", Gia: "char-gia" };
const resolve = (name: string) => byName[name] ?? null;

// One rung per scene, the drift follows the move, and the scene's turn becomes the moment.
const leap = planBondUpdates(
  { bonds: [{ who: "Vee", rung: "Devoted", drift: "holding", turn: "He finally said it." }] },
  current,
  resolve,
);
assert.equal(leap.changes[0]!.rung, "Confidant", "one rung, not three");
assert.equal(leap.changes[0]!.drift, "💗 HEART EVENT", "a rise is a heart event whatever the agent said");
assert.deepEqual(leap.moments, [{ id: veeId, from: "Close", to: "Confidant", text: "He finally said it." }]);

const fall = planBondUpdates({ bonds: [{ who: "Vee", rung: "Hostile" }] }, current, resolve);
assert.equal(fall.changes[0]!.rung, "Wary", "a falling out lands on the cold ladder's first rung");
assert.equal(fall.changes[0]!.drift, "🥀 FALLING OUT");

// A romance moves one status at a time; the first version's "stage" still reads.
const rush = planBondUpdates({ bonds: [{ who: "Vee", stage: "married" }] }, current, resolve);
assert.equal(rush.changes[0]!.status, "engaged", "one status, not two");

// Fields: flat or nested, only the kind's own, never cleared by an empty one.
const detail = planBondUpdates(
  { bonds: [{ who: "Vee", tell: "Cracks his knuckles.", fields: { unsaid: "Don't go." }, vibe: "x", trust: "" }] },
  current,
  resolve,
);
assert.deepEqual(detail.changes[0]!.fields, { tell: "Cracks his knuckles.", unsaid: "Don't go." });
assert.equal(detail.moments.length, 0, "no rung moved, so no moment");

// A missing field never resets anything, and a made-up kind or rung is ignored.
const quiet = planBondUpdates({ bonds: [{ who: "Nessa", vibe: "Closer since the fight." }] }, current, resolve);
assert.equal(quiet.changes[0]!.kind, undefined);
assert.equal(quiet.changes[0]!.rung, undefined);
const nonsense = planBondUpdates({ bonds: [{ who: "Nessa", kind: "nemesis", rung: "Devoted" }] }, current, resolve);
assert.equal(nonsense.changes.length, 0, "nothing in the update was usable, so nothing changes");

// A change of kind takes the new ladder's rung as named, with no moment.
const turned = planBondUpdates(
  { bonds: [{ who: "Nessa", kind: "love", rung: "Close", status: "dating" }] },
  current,
  resolve,
);
assert.equal(turned.changes[0]!.kind, "love");
assert.equal(turned.changes[0]!.rung, "Close");
assert.equal(turned.changes[0]!.status, "dating");
assert.equal(turned.moments.length, 0);

// Somebody new becomes a new bond rather than overwriting the nearest one.
const stranger = planBondUpdates(
  { bonds: [{ who: "the man at the door", kind: "rival", rung: "Rival" }] },
  current,
  resolve,
);
assert.equal(stranger.changes.length, 0);
assert.equal(stranger.creations.length, 1);
assert.equal(stranger.creations[0]!.rung, "Rival", "a first impression is taken as given");
assert.ok(stranger.creations[0]!.characterId.startsWith("outsider-"));
assert.equal(
  planBondUpdates({ bonds: [{ who: "Gia", kind: "ex" }] }, [], resolve).creations[0]!.characterId,
  "char-gia",
);

// Naming the same person twice does not apply twice; nothing, or rubbish, changes nothing.
assert.equal(
  planBondUpdates(
    {
      bonds: [
        { who: "Vee", rung: "Confidant" },
        { who: "Vee", rung: "Intimate" },
      ],
    },
    current,
    resolve,
  ).changes.length,
  1,
);
const empty = { changes: [], creations: [], moments: [] };
assert.deepEqual(planBondUpdates(null, current, resolve), empty);
assert.deepEqual(planBondUpdates({ bonds: "no" }, current, resolve), empty);
assert.deepEqual(planBondUpdates({ bonds: [{ who: "   " }] }, current, resolve), empty);

// ── The updating agent is shown the format and what the tracker holds ──
const stateBlock = bondsAgentStateBlock(current, (id) => names[id] ?? "");
assert.ok(
  stateBlock.startsWith("<relationship_tracker_format>"),
  "the format comes with the state, so old agents answer in the new shape",
);
assert.ok(stateBlock.includes("Stranger → Noticed → Acquaintance"), "the ladders come from the shared shapes");
assert.ok(stateBlock.includes('"who":"Vee"') && stateBlock.includes('"rung":"Close"'));
assert.ok(stateBlock.trimEnd().endsWith("</current_relationships>"));
assert.ok(bondsAgentStateBlock([], () => "").includes("holds nothing yet"));

// ── Leaving a tangled state lands where it is named ──
assert.equal(step("love", "Complicated", "Devoted"), "Devoted", "a marriage is not dropped to Stranger");

// ── A swipe replaces the reply's move instead of adding to it ──
const swipeBond = (await store.create({ chatId: "chat-swipe", characterId: "char-sol", kind: "love", rung: "Close" }))!;
const solResolve = (name: string) => (name === "Sol" ? "char-sol" : null);
const reading = { bonds: [{ who: "Sol", rung: "Devoted", status: "dating", turn: "The kiss." }] };
await applyBondsAgentResult(db, "chat-swipe", reading, solResolve, "msg-1");
assert.equal((await store.getById(swipeBond.id))!.rung, "Confidant");
const beforeReply = (await listBondsBeforeTurn(db, "chat-swipe", "msg-1")).find((bond) => bond.id === swipeBond.id)!;
assert.equal(beforeReply.rung, "Close", "a swipe is shown the bond as it was before the reply it replaces");
assert.equal(beforeReply.status, "talking");
assert.equal((await store.getById(swipeBond.id))!.rung, "Confidant", "and nothing was written to show it");
await applyBondsAgentResult(db, "chat-swipe", reading, solResolve, "msg-1");
await applyBondsAgentResult(db, "chat-swipe", reading, solResolve, "msg-1");
const swiped = (await store.getById(swipeBond.id))!;
assert.equal(swiped.rung, "Confidant", "three swipes of one reply move one rung, not three");
assert.equal(swiped.status, "dating");
assert.equal(
  (await store.listMoments(swipeBond.id)).length,
  2,
  "the swiped-away reply's moments go with it (one rung, one status)",
);
await applyBondsAgentResult(db, "chat-swipe", { bonds: [{ who: "Sol", rung: "Stranger" }] }, solResolve, "msg-1");
assert.equal((await store.getById(swipeBond.id))!.rung, "Friendly", "a re-roll steps from before the reply");
await applyBondsAgentResult(db, "chat-swipe", reading, solResolve, "msg-2");
assert.equal((await store.getById(swipeBond.id))!.rung, "Close", "the next reply steps from there");
await store.update(swipeBond.id, { rung: "Intimate" });
await applyBondsAgentResult(db, "chat-swipe", { bonds: [] }, solResolve, "msg-2");
assert.equal((await store.getById(swipeBond.id))!.rung, "Intimate", "a change made by hand since is never taken back");
await store.removeChat("chat-swipe");
assert.equal((await store.listMomentsForChat("chat-swipe")).length, 0);

// ── An old bond's worked-out rung is written down on its first edit ──
await db.insert(bonds).values({
  id: "legacy-row",
  chatId: "chat-old",
  characterId: "char-old",
  label: "",
  kind: "love",
  stage: "talking",
  rung: "",
  order: 0,
  createdAt: "",
  updatedAt: "",
} as never);
assert.equal((await store.getById("legacy-row"))!.rung, "Familiar");
await store.update("legacy-row", { status: "dating" });
assert.equal((await store.getById("legacy-row"))!.rung, "Familiar", "a status change does not move the rung");

// ── Pairs: how two characters stand with each other ──
const { createBondPairsStorage, pairsPromptBlock, planPairUpdates } =
  await import("../../packages/server/src/services/bonds/fork-bond-pairs.js");
const pairStore = createBondPairsStorage(db);
const veeGia = (await pairStore.create({
  chatId: "chat-pairs",
  firstId: "char-vee",
  secondId: "char-gia",
  kind: "family",
  rung: "Distant",
  aLine: "Lets her calls ring out.",
  bLine: "Still calls every Sunday.",
}))!;
assert.equal(veeGia.aId, "char-gia", "a pair is stored in a fixed order");
assert.equal(veeGia.aLine, "Still calls every Sunday.", "and each side's line follows its person");
assert.equal(
  (await pairStore.create({ chatId: "chat-pairs", firstId: "char-gia", secondId: "char-vee" }))!.id,
  veeGia.id,
  "the same two people are never a second pair",
);
assert.equal(await pairStore.create({ chatId: "chat-pairs", firstId: "char-vee", secondId: "char-vee" }), null);
const pairNames = (id: string) => ({ "char-vee": "Vee", "char-gia": "Gia", "char-dee": "Dee" })[id] ?? "";
assert.equal(
  pairsPromptBlock(await pairStore.listForChat("chat-pairs"), pairNames),
  "Between the characters:\n- Gia & Vee (family): Distant. Gia: Still calls every Sunday. Vee: Lets her calls ring out.",
);
const pairResolve = (name: string) => ({ Vee: "char-vee", Gia: "char-gia", Dee: "char-dee" })[name] ?? null;
const pairPlan = planPairUpdates(
  {
    pairs: [
      { a: "Vee", b: "Gia", rung: "Close", a_feels: "Picked up for once." },
      { a: "Vee", b: "Dee", kind: "friend", rung: "Ride-or-die" },
      { a: "Vee", b: "Nobody", kind: "friend" },
    ],
  },
  await pairStore.listForChat("chat-pairs"),
  pairResolve,
);
assert.deepEqual(
  pairPlan.changes,
  [{ id: veeGia.id, rung: "Dutiful", bLine: "Picked up for once." }],
  "one rung per scene, the right side's line",
);
assert.equal(pairPlan.creations.length, 1, "a pair with someone who is not a card is skipped");
assert.equal(pairPlan.creations[0]!.rung, "Ride-or-die", "a new pair starts where it is named");

// A swipe takes back the pair's move too.
await applyBondsAgentResult(db, "chat-pairs", { pairs: [{ a: "Vee", b: "Gia", rung: "Close" }] }, pairResolve, "msg-p");
assert.equal((await pairStore.getById(veeGia.id))!.rung, "Dutiful");
await applyBondsAgentResult(db, "chat-pairs", { pairs: [{ a: "Vee", b: "Gia", rung: "Close" }] }, pairResolve, "msg-p");
assert.equal((await pairStore.getById(veeGia.id))!.rung, "Dutiful", "two swipes of one reply move a pair one rung");
// What moved lately: the writer is reminded, and a step up is a milestone for the Director.
const { listRecentBondChanges, recentChangesPromptBlock, milestoneNudgeLine } =
  await import("../../packages/server/src/services/bonds/fork-bond-recent.js");
const recentMoves = await listRecentBondChanges(db, "chat-pairs", ["msg-old", "msg-p", "msg-new"]);
assert.deepEqual(
  recentMoves.map(({ from, to, repliesAgo, milestone }) => ({ from, to, repliesAgo, milestone })),
  [{ from: "Distant", to: "Dutiful", repliesAgo: 1, milestone: true }],
);
const pairNow = await pairStore.listForChat("chat-pairs");
assert.equal(
  recentChangesPromptBlock(recentMoves, [], pairNow, pairNames),
  "What changed lately (keep these changes showing; newest first):\n- Gia & Vee: Distant → Dutiful (one reply ago)",
);
assert.ok(milestoneNudgeLine(recentMoves, [], pairNow, pairNames).startsWith("Milestones just reached"));
assert.equal(
  (await listRecentBondChanges(db, "chat-pairs", ["msg-p", ...Array.from({ length: 12 }, (_, i) => `m${i}`)])).length,
  0,
  "an old change drops out of the reminder",
);
assert.equal(
  (await listRecentBondChanges(db, "chat-pairs", ["msg-other"])).length,
  0,
  "a reply that is gone counts for nothing",
);

// Undoing a change of kind puts the old rung back too, not the old kind's first rung.
await applyBondsAgentResult(db, "chat-pairs", { pairs: [{ a: "Vee", b: "Gia", kind: "rival" }] }, pairResolve, "msg-k");
assert.equal((await pairStore.getById(veeGia.id))!.kind, "rival");
await undoBondTurn(db, "chat-pairs", "msg-k");
assert.equal((await pairStore.getById(veeGia.id))!.kind, "family");
assert.equal((await pairStore.getById(veeGia.id))!.rung, "Dutiful", "the swipe brings back the rung it had");
assert.ok(
  bondsAgentStateBlock([], pairNames, await pairStore.listForChat("chat-pairs")).includes('"a":"Gia","b":"Vee"'),
  "the agent is shown the pairs it can move",
);
await pairStore.removeChat("chat-pairs");
assert.equal((await pairStore.listForChat("chat-pairs")).length, 0);

// ── The tracker is capped ──
for (let index = 0; index < MAX_BONDS_PER_CHAT; index += 1) {
  await store.create({ chatId: "chat-full", characterId: `char-${index}`, kind: "other" });
}
assert.equal(await store.create({ chatId: "chat-full", characterId: "char-extra", kind: "other" }), null);

// ── A branch copies the relationships and their moments; deleting a chat clears both ──
const { boardPins } = await import("../../packages/server/src/services/board/fork-board-pins.js");
registerForkTables([boardPins]);
const { copyForkChatData, removeForkChatData } = await import("../../packages/server/src/services/fork-chat-data.js");
await copyForkChatData(db, CHAT, "branch-new");
const copied = await store.listForChat("branch-new");
assert.equal(copied.length, 3, "the branch has the bonds");
const copiedVee = copied.find((bond) => bond.characterId === "char-vee")!;
assert.equal(copiedVee.rung, "Close");
assert.equal(copiedVee.fields.trust, "Not with the money.");
assert.notEqual(copiedVee.id, veeId, "a copy, not the same row");
assert.equal((await store.listMoments(copiedVee.id)).length, 2, "the branch keeps the story so far");
await removeForkChatData(db, "branch-new");
assert.equal((await store.listForChat("branch-new")).length, 0);
assert.equal((await store.listMomentsForChat("branch-new")).length, 0, "and its moments");
assert.equal((await store.listMomentsForChat(CHAT)).length, 2, "the source keeps its own");
await store.removeChat(CHAT);
assert.equal((await store.listMomentsForChat(CHAT)).length, 0, "deleting a chat clears its moments");

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork bonds: ok");
