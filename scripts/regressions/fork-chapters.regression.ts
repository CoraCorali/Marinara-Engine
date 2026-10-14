/**
 * Fork: chapters. A finished chapter leaves the history at its last message, its recap goes in the
 * summary slot, a swipe inside a finished chapter only counts the chapters before it, edits inside
 * a chapter mark its recap out of date, and branches keep only chapters they fully contain.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-chapters-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const chaptersModule = await import("../../packages/server/src/services/chapters/fork-chapters.js");
const recapModule = await import("../../packages/server/src/services/chapters/fork-chapter-recap.js");
const { copyForkChatData, markForkChaptersStale } =
  await import("../../packages/server/src/services/fork-chat-data.js");
const {
  chapters,
  chaptersBefore,
  combineWithRollingSummary,
  createChaptersStorage,
  needsEarlierMerge,
  readEarlierRecap,
  storySoFarBlock,
} = chaptersModule;

const db = await getDB();
registerForkTables([chapters]);
const store = createChaptersStorage(db);

// Ten messages; two share a timestamp, so order falls back to the id the way Marinara lists them.
const at = (minute: number) => `2026-10-14T10:${String(minute).padStart(2, "0")}:00.000Z`;
const messages = [
  { id: "m00", createdAt: at(0) },
  { id: "m01", createdAt: at(1) },
  { id: "m02", createdAt: at(2) },
  { id: "m03a", createdAt: at(3) },
  { id: "m03b", createdAt: at(3) },
  { id: "m04", createdAt: at(4) },
  { id: "m05", createdAt: at(5) },
  { id: "m06", createdAt: at(6) },
  { id: "m07", createdAt: at(7) },
  { id: "m08", createdAt: at(8) },
];

const one = await store.create({
  chatId: "chat-a",
  title: "The Night of the Storm",
  first: messages[0]!,
  last: messages[3]!,
  messageCount: 4,
  recap: "## What happened\nTheo walked Kyli home in the rain.",
});
const two = await store.create({
  chatId: "chat-a",
  title: "",
  first: messages[4]!,
  last: messages[6]!,
  messageCount: 3,
  recap: "## What happened\nThey baked at dawn.",
});
assert.equal(one.number, 1);
assert.equal(two.number, 2, "chapters number themselves in order");

const all = await store.listForChat("chat-a");
let cut = chaptersBefore(all, messages);
assert.deepEqual(
  cut.finished.map((chapter) => chapter.number),
  [1, 2],
);
assert.equal(cut.startIndex, 7, "the history starts after the last finished chapter");
assert.equal(chaptersBefore(all, messages, 5).finished.length, 1, "a swipe inside chapter 2 only counts chapter 1");
assert.equal(chaptersBefore(all, messages, 5).startIndex, 4, "the same-timestamp message after m03a starts chapter 2");
assert.equal(chaptersBefore(all, messages, 6).finished.length, 1, "a swipe of chapter 2's last message keeps it open");
assert.equal(chaptersBefore(all, messages, 7).finished.length, 2, "the first message after it counts both");
assert.equal(chaptersBefore([], messages).startIndex, 0, "no chapters, no cut");

// The chapter end survives its last message being deleted.
const withoutEnd = messages.filter((message) => message.id !== "m06");
cut = chaptersBefore(all, withoutEnd);
assert.equal(withoutEnd[cut.startIndex]?.id, "m07", "a deleted last message still ends the chapter in place");

// ── What the writer reads ──
const block = storySoFarBlock(all, null, 3);
assert.match(block, /### Chapter 1 · The Night of the Storm\n## What happened\nTheo walked Kyli home/);
assert.match(block, /### Chapter 2\n## What happened\nThey baked/, "an untitled chapter keeps just its number");
assert.match(block, /The story is now in Chapter 3/);
assert.ok(block.indexOf("Chapter 1") < block.indexOf("Chapter 2"), "oldest first");
assert.equal(storySoFarBlock([], null, 1), "", "nothing until a chapter ends");
const merged = storySoFarBlock(all, { through: 1, text: "Earlier text." }, 3);
assert.match(merged, /### Earlier \(chapters 1–1\)\nEarlier text\./);
assert.doesNotMatch(merged, /Night of the Storm/, "a merged chapter is not sent twice");
assert.doesNotMatch(
  storySoFarBlock(all, { through: 2, text: "Too far." }, 3),
  /Too far/,
  "an Earlier recap covering every chapter is ignored, so the newest always goes whole",
);
assert.equal(
  combineWithRollingSummary(block, "Kyli found the note.").endsWith("This chapter so far:\nKyli found the note."),
  true,
);
assert.equal(
  combineWithRollingSummary("", "Only the summary."),
  "Only the summary.",
  "no chapters, the summary as before",
);
assert.equal(combineWithRollingSummary("", null), null);
assert.deepEqual(readEarlierRecap({ forkChaptersEarlier: { through: 2, text: "x" } }), { through: 2, text: "x" });
assert.equal(readEarlierRecap({ forkChaptersEarlier: null }), null);
assert.equal(readEarlierRecap({ forkChaptersEarlier: { through: 0, text: "x" } }), null);

// ── The budget ──
const long = (number: number) => ({ ...one, number, recap: "x".repeat(6000) });
assert.equal(needsEarlierMerge([long(1), long(2)], null), false, "the two newest always stay whole");
assert.equal(needsEarlierMerge([long(1), long(2), long(3)], null), true);
assert.equal(needsEarlierMerge([one, two, { ...two, number: 3 }], null), false, "short recaps fit");

// ── Out of date ──
await markForkChaptersStale(db, [{ id: "m05", chatId: "chat-a", createdAt: at(5) }]);
let fresh = await store.listForChat("chat-a");
assert.equal(fresh[0]!.stale, false);
assert.equal(fresh[1]!.stale, true, "an edit in chapter 2 marks chapter 2 only");
await markForkChaptersStale(db, [{ id: "m08", chatId: "chat-a", createdAt: at(8) }]);
assert.equal(
  (await store.listForChat("chat-a")).filter((chapter) => chapter.stale).length,
  1,
  "the current chapter has no recap",
);
const edited = await store.update(two.id, { title: "  Dawn  ", recap: "## What happened\nThey baked bread." });
assert.equal(edited?.stale, false, "an edit or a fresh recap makes it current again");
assert.equal(edited?.title, "Dawn");

// ── Branches ──
const map = new Map([
  ["m00", "b00"],
  ["m01", "b01"],
  ["m02", "b02"],
  ["m03a", "b03a"],
  ["m03b", "b03b"],
  ["m04", "b04"],
]);
await copyForkChatData(db, "chat-a", "chat-b", map);
fresh = await store.listForChat("chat-b");
assert.equal(fresh.length, 1, "a branch from inside chapter 2 keeps chapter 2 open");
assert.equal(fresh[0]!.lastMessageId, "b03a", "and points at its own copy of the messages");
await copyForkChatData(db, "chat-a", "chat-c");
assert.equal((await store.listForChat("chat-c")).length, 0, "no message map, no chapters");

await store.removeChat("chat-a");
assert.equal((await store.listForChat("chat-a")).length, 0);
assert.equal((await store.listForChat("chat-b")).length, 1, "removing one chat leaves the others");

// ── The recap ──
const { readRecap, sliceMessages, targetSentences, plainMessageText, buildRecapMessages, buildMergeMessages } =
  recapModule;
assert.deepEqual(readRecap("Here you go!\nTitle: The Fair\n\n## What happened\nThey went."), {
  title: "The Fair",
  recap: "## What happened\nThey went.",
});
assert.deepEqual(readRecap("**Title:** *The Fair*\n## What happened\nx"), {
  title: "The Fair",
  recap: "## What happened\nx",
});
assert.equal(readRecap("  "), null);
assert.equal(readRecap("```\nTitle: A\n## What happened\nB\n```")?.recap, "## What happened\nB");
assert.deepEqual(sliceMessages([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(
  sliceMessages(Array.from({ length: 48 }, (_, index) => index)).map((slice) => slice.length),
  [24, 24],
  "slices are even, so the last part is never a scrap",
);
assert.equal(sliceMessages([]).length, 0);
const sliceNote = recapModule.buildSliceNoteMessages(
  [{ role: "user", name: "K", content: "x" }],
  2,
  2,
  { chapterNumber: 1, messageCount: 2, personaName: "K", people: "", previousTitles: [] },
  "Theo said he is selling the bakery.",
);
assert.match(sliceNote[1]!.content, /Notes on part 1, for context only[^\n]*\nTheo said he is selling the bakery\./);
assert.equal(targetSentences(10), 8, "never under about 200 words");
assert.equal(targetSentences(112), 32, "about one sentence per three or four messages");
assert.equal(plainMessageText("<details><summary>Stats</summary>HP 3</details><p>She ran.</p>"), "Stats HP 3 She ran.");
const prompt = buildRecapMessages([{ role: "user", name: "Kyli", content: "Hi <b>Theo</b>" }], {
  chapterNumber: 2,
  messageCount: 1,
  personaName: "Kyli",
  people: "Theo: Close",
  previousTitles: ["The Night of the Storm"],
});
assert.match(prompt[0]!.content, /## Where people stand/);
assert.match(prompt[1]!.content, /Kyli: Hi Theo/);
assert.match(prompt[1]!.content, /must agree with this:\nTheo: Close/);
assert.match(prompt[1]!.content, /1\. The Night of the Storm/);
assert.match(
  buildMergeMessages(["a", "b"], {
    chapterNumber: 1,
    messageCount: 80,
    personaName: "K",
    people: "",
    previousTitles: [],
  })[1]!.content,
  /\[Part 2\]\nb/,
);

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork chapters: ok");
