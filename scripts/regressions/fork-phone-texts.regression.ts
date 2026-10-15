/**
 * Fork: Pocket Phone, swipes and fixes on texts. Only their newest text swipes (never yours, never
 * one already answered); a new version goes at the end and earlier ones stay; going back and forth
 * keeps the words; a fix or an edit changes the shown version, so swiping away and back keeps it;
 * a fix knows the text it answered; the swipe prompt never writes the persona's words.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-phone-texts-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const texts = await import("../../packages/server/src/services/phone/fork-phone-texts.js");
const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const phone = await import("../../packages/server/src/services/phone/fork-phone.js");

const db = await getDB();
registerForkTables([phone.phoneThreads, phone.phoneMessages]);
const store = phone.createPhoneStorage(db);
const thread = await store.ensureThread("c1", "persona", "theo");
const add = (sender: string, body: string, source: "user" | "agent" = "agent") =>
  store.addMessage({ chatId: "c1", threadId: thread.id, sender, body, source });

const old = (await add("theo", "you up?"))!;
const mine = (await add("persona", "yeah", "user"))!;
const newest = (await add("theo", "good. the rain stopped"))!;
const list = async () => store.listMessages("c1");

// ── Which texts swipe ──
assert.equal(texts.canSwipePhoneText(newest, await list()), true, "their newest text swipes");
assert.equal(texts.canSwipePhoneText(old, await list()), false, "an answered text does not");
assert.equal(texts.canSwipePhoneText(mine, await list()), false, "your own text does not");
assert.equal(texts.textItAnswered(newest, await list()), "yeah", "a fix knows the text it answered");
assert.equal(texts.textItAnswered(old, await list()), "");

// ── Versions ──
let versions = texts.applyTextSwipe(newest, { added: "rain's gone. you good?" });
assert.deepEqual([versions.swipes.length, versions.activeSwipe, versions.body], [2, 1, "rain's gone. you good?"]);
let saved = (await store.setVersions(newest.id, versions))!;
versions = texts.applyTextSwipe(saved, { to: 0 });
saved = (await store.setVersions(newest.id, versions))!;
assert.equal(saved.body, "good. the rain stopped", "back to the first version");
assert.deepEqual(texts.applyTextSwipe(saved, { to: 9 }).activeSwipe, 1, "a version past the end is the last");
const many = {
  body: "x",
  swipes: Array.from({ length: texts.MAX_TEXT_SWIPES }, (_, index) => `v${index}`),
  activeSwipe: 0,
};
assert.equal(texts.applyTextSwipe(many, { added: "new" }).swipes.length, texts.MAX_TEXT_SWIPES, "versions are capped");

// ── A fix or an edit changes the shown version ──
const fixed = (await store.setText(newest.id, "  good. rain's done  "))!;
assert.equal(fixed.body, "good. rain's done");
assert.deepEqual(fixed.swipes, ["good. rain's done", "rain's gone. you good?"], "the fix replaced the shown version");
const back = (await store.setVersions(newest.id, texts.applyTextSwipe(fixed, { to: 1 })))!;
const again = (await store.setVersions(newest.id, texts.applyTextSwipe(back, { to: 0 })))!;
assert.equal(again.body, "good. rain's done", "swiping away and back keeps the fix");
const edited = (await store.setText(mine.id, "yeah, home now"))!;
assert.deepEqual([edited.body, edited.swipes], ["yeah, home now", []], "your edit has no versions");
assert.equal(await store.setText(mine.id, "   "), null, "an empty edit is refused");

// ── The swipe prompt ──
const prompt = texts.buildTextSwipeMessages({
  name: "Theo",
  who: "a quiet baker",
  personaName: "Kyli",
  story: "",
  earlier: [{ name: "Kyli", text: "yeah" }],
  versions: ["good. the rain stopped"],
})[0]!.content;
assert.match(prompt, /Versions of Theo's newest text so far:\n- good\. the rain stopped/);
assert.match(prompt, /Never write Kyli's words/);
assert.equal(texts.readTextSwipe('Theo: "rain stopped. you ok?"\n\nnote: shorter', "Theo"), "rain stopped. you ok?");

// ── Texts sent together keep their order ──
const burst = await store.ensureThread("c1", "persona", "contact:Jess");
for (const body of ["one", "two", "three", "four"]) {
  await store.addMessage({ chatId: "c1", threadId: burst.id, sender: "contact:Jess", body, source: "agent" });
}
const sent = (await list()).filter((message) => message.threadId === burst.id);
assert.deepEqual(
  sent.map((message) => message.body),
  ["one", "two", "three", "four"],
);
assert.equal(new Set(sent.map((message) => message.createdAt)).size, 4, "each text has its own time");

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork phone texts: ok");
