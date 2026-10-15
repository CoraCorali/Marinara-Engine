/**
 * Fork: Pocket Phone basics. One thread per pair, whichever side starts it; your texts stay when a
 * reply is deleted while the AI's go with it; a branch keeps the texts up to its branch point; the
 * writer is told the latest texts and calls with the persona; settings stay within the approved
 * skins and colours, and the phone is off unless switched on.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-phone-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const phone = await import("../../packages/server/src/services/phone/fork-phone.js");
const { phonePromptBlock, PHONE_TEXTS_PER_THREAD } =
  await import("../../packages/server/src/services/phone/fork-phone-prompt.js");
const { forgetForkReplies, copyForkChatData, removeForkChatData } =
  await import("../../packages/server/src/services/fork-chat-data.js");
const shared = await import("../../packages/shared/src/features/fork-phone.js");

const db = await getDB();
registerForkTables([phone.phoneThreads, phone.phoneMessages]);
const store = phone.createPhoneStorage(db);

// ── Threads ──
const theo = await store.ensureThread("c1", "persona", "char-theo");
const again = await store.ensureThread("c1", "char-theo", "persona");
assert.equal(again.id, theo.id, "one pair, one thread, whoever texts first");
assert.equal(phone.phoneSide("contact:  Mom "), "contact:Mom");
assert.equal(phone.phoneSide(42), "");

// ── Texts ──
const mine = await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "persona",
  body: " got home ok ",
  storyTime: "11:40 PM",
  afterMessageId: "m1",
});
assert.equal(mine?.body, "got home ok");
assert.equal(mine?.read, true, "your own text is read");
const his = await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "char-theo",
  body: "good. keep the umbrella",
  storyTime: "11:42 PM",
  afterMessageId: "m2",
  source: "agent",
});
assert.equal(his?.read, false, "a character's text arrives unread");
assert.deepEqual(his?.swipes, ["good. keep the umbrella"], "an AI text starts its own swipes");
assert.equal(await store.addMessage({ chatId: "c1", threadId: theo.id, sender: "persona", body: "   " }), null);
await store.markRead(theo.id);
assert.ok((await store.listMessages("c1")).every((message) => message.read));

// ── What the writer is told ──
const block = phonePromptBlock(await store.listThreads("c1"), await store.listMessages("c1"), "Kyli", (id) =>
  id === "char-theo" ? "Theo" : "",
);
assert.match(block, /really happened/);
assert.match(
  block,
  /Texts between Kyli and Theo \(oldest first\):\n- \[11:40 PM\] Kyli: got home ok\n- \[11:42 PM\] Theo: good\. keep the umbrella/,
);
assert.equal(
  phonePromptBlock([], [], "Kyli", () => ""),
  "",
  "no texts, no block",
);
const many = Array.from({ length: PHONE_TEXTS_PER_THREAD + 3 }, (_, index) => ({
  ...mine!,
  id: `x${index}`,
  body: `text ${index}`,
}));
const capped = phonePromptBlock([theo], many, "Kyli", () => "Theo");
assert.doesNotMatch(capped, /text 0\n/, "only the last few texts per thread");
assert.match(capped, new RegExp(`text ${PHONE_TEXTS_PER_THREAD + 2}`));
// Theo texting Mira is not the persona's thread, so the writer does not read it here.
const pair = await store.ensureThread("c1", "char-theo", "char-mira");
await store.addMessage({ chatId: "c1", threadId: pair.id, sender: "char-theo", body: "she kept it", source: "agent" });
assert.doesNotMatch(
  phonePromptBlock(await store.listThreads("c1"), await store.listMessages("c1"), "Kyli", () => "x"),
  /she kept it/,
);

// ── A swipe takes back the AI's texts after the reply; yours stay ──
const yoursAfterM2 = await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "persona",
  body: "ok bossy",
  afterMessageId: "m2",
});
await store.forgetAgentMessages("c1", ["m2"]);
let left = await store.listMessages("c1");
assert.ok(!left.some((message) => message.body === "good. keep the umbrella"), "the AI's text after m2 goes");
assert.ok(
  left.some((message) => message.id === yoursAfterM2?.id),
  "a swipe keeps your text",
);

// ── A deleted story message takes every phone message shown after it, yours too ──
await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "char-theo",
  body: "answered you",
  afterMessageId: "m2",
  source: "user",
});
await forgetForkReplies(db, [{ id: "m2", chatId: "c1", createdAt: "2026-10-14T10:01:00.000Z" }]);
left = await store.listMessages("c1");
assert.ok(
  !left.some((message) => ["ok bossy", "answered you"].includes(message.body)),
  "your text and their answer after the deleted m2 go",
);
assert.ok(
  left.some((message) => message.body === "got home ok"),
  "the text after m1 stays",
);

// ── Branches ──
await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "persona",
  body: "later text",
  afterMessageId: "m9",
});
const callCard = await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "char-theo",
  body: "",
  kind: "call",
  afterMessageId: "m1",
  source: "agent",
});
await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "char-theo",
  body: "you up?",
  kind: "call_line",
  afterMessageId: "m1",
  source: "agent",
  callId: callCard!.id,
});
await copyForkChatData(db, "c1", "c2", new Map([["m1", "b1"]]));
const branched = await store.listMessages("c2");
const branchedTexts = branched.filter((message) => message.kind === "text");
assert.deepEqual(
  branchedTexts.map((message) => [message.body, message.afterMessageId]).sort(),
  [
    ["got home ok", "b1"],
    ["she kept it", ""],
  ],
  "the branch keeps texts up to its branch point, tied to its own copies",
);
const branchCard = branched.find((message) => message.kind === "call");
assert.equal(
  branched.find((message) => message.kind === "call_line")?.callId,
  branchCard?.id,
  "a call's lines point at the branch's copy of the call",
);
assert.equal((await store.listThreads("c2")).length, 2);
await removeForkChatData(db, "c2");
assert.equal((await store.listMessages("c2")).length, 0);
assert.equal((await store.listThreads("c2")).length, 0, "deleting a chat deletes its phones");

// ── Settings ──
assert.equal(shared.readForkPhoneSettings({}).on, false, "off by default");
assert.equal(shared.readForkPhoneSettings({}).skin, "slider");
const odd = shared.readForkPhoneSettings({ forkPhone: { on: true, skin: "flip", color: "neon", keys: "t9" } });
assert.deepEqual([odd.on, odd.skin, odd.color, odd.keys], [true, "slider", "pink-pearl", "qwerty"]);
assert.equal(
  shared.normalizeForkPhoneLook({ skin: "candybar", color: "pink-pearl" }).color,
  "sky",
  "colours follow the skin",
);
assert.equal(shared.normalizeForkPhoneLook({ skin: "candybar", color: "silver", keys: "number" }).keys, "number");

// ── Deleting a call takes what was said on it ──
const ringCard = await store.addMessage({
  chatId: "c9",
  threadId: theo.id,
  sender: "char-theo",
  body: "",
  kind: "call",
});
await store.addMessage({
  chatId: "c9",
  threadId: theo.id,
  sender: "char-theo",
  body: "hey",
  kind: "call_line",
  callId: ringCard!.id,
});
await store.removeMessage(ringCard!.id);
assert.deepEqual(await store.listMessages("c9"), [], "the call and its lines are gone");

// ── Saving an unknown number moves its texts to the new contact ──
const unknownThread = await store.ensureThread("c8", "persona", "unknown:Deidra");
await store.addMessage({ chatId: "c8", threadId: unknownThread.id, sender: "unknown:Deidra", body: "its me" });
await store.addMessage({ chatId: "c8", threadId: unknownThread.id, sender: "persona", body: "who is this" });
await store.renameSide("c8", "unknown:Deidra", "contact:Deidra");
const saved = await store.listThreads("c8");
assert.deepEqual(
  saved.map((thread) => [thread.a, thread.b]),
  [["contact:Deidra", "persona"]],
);
assert.deepEqual(
  (await store.listMessages("c8")).map((message) => [message.threadId, message.sender, message.body]),
  [
    [saved[0]!.id, "contact:Deidra", "its me"],
    [saved[0]!.id, "persona", "who is this"],
  ],
);

// ── Day and "Read": a text keeps its story day; a text left unanswered keeps when it was seen ──
const dayThread = await store.ensureThread("c7", "persona", "char-theo");
const dated = await store.addMessage({
  chatId: "c7",
  threadId: dayThread.id,
  sender: "persona",
  body: "you up?",
  storyTime: "11 PM",
  storyDate: "Day 3 - Monday",
});
assert.equal(dated?.storyDate, "Day 3 - Monday");
assert.equal(dated?.seenAt, "", "not seen yet");
await store.markSeen(dated!.id, "11:05 PM");
assert.equal((await store.getMessage(dated!.id))?.seenAt, "11:05 PM");
await store.markSeen(dated!.id, "");
assert.equal((await store.getMessage(dated!.id))?.seenAt, "seen", "seen with no story time still counts");
assert.match(
  phonePromptBlock(await store.listThreads("c7"), await store.listMessages("c7"), "Kyli", () => "Theo"),
  /Kyli: you up\? \(seen, not answered\)/,
  "the writer knows they left it on read",
);

// ── A renamed contact keeps their conversation ──
const momThread = await store.ensureThread("c6", "persona", "contact:Mom");
await store.addMessage({ chatId: "c6", threadId: momThread.id, sender: "contact:Mom", body: "call me" });
await store.renameSide("c6", "contact:Mom", "contact:Mama");
assert.deepEqual(
  (await store.listMessages("c6")).map((message) => message.sender),
  ["contact:Mama"],
);

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork phone: ok");
