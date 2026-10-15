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

// ── A deleted reply takes the AI's texts after it; yours stay ──
await forgetForkReplies(db, [
  { id: "m1", chatId: "c1", createdAt: "2026-10-14T10:00:00.000Z" },
  { id: "m2", chatId: "c1", createdAt: "2026-10-14T10:01:00.000Z" },
]);
let left = await store.listMessages("c1");
assert.ok(
  left.some((message) => message.body === "got home ok"),
  "your text stays",
);
assert.ok(!left.some((message) => message.body === "good. keep the umbrella"), "the AI's text after m2 goes");

// ── Branches ──
await store.addMessage({
  chatId: "c1",
  threadId: theo.id,
  sender: "persona",
  body: "later text",
  afterMessageId: "m9",
});
await copyForkChatData(db, "c1", "c2", new Map([["m1", "b1"]]));
const branched = await store.listMessages("c2");
assert.deepEqual(
  branched.map((message) => [message.body, message.afterMessageId]).sort(),
  [
    ["got home ok", "b1"],
    ["she kept it", ""],
  ],
  "the branch keeps texts up to its branch point, tied to its own copies",
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

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork phone: ok");
