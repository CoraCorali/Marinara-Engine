/**
 * Fork: Pocket Phone contacts. Contacts keep unique names and an approved label; the phone agent
 * matches a saved contact whatever the case and lets them text you, while an unsaved name cannot;
 * a contact's answer is read safely; the prompts tell who they are and that they only know what you
 * told them, plus their own part in story passages that name them; the writer's phone block lists them; deleting a contact's thread removes its texts.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-phone-contacts-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const shared = await import("../../packages/shared/src/features/fork-phone.js");
const agent = await import("../../packages/server/src/services/phone/fork-phone-agent.js");
const prompt = await import("../../packages/server/src/services/phone/fork-phone-prompt.js");
const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const phone = await import("../../packages/server/src/services/phone/fork-phone.js");

// ── Saved contacts ──
const contacts = shared.normalizeForkPhoneContacts([
  { name: "  Mom ", relation: "family", note: "worries a lot" },
  { name: "mom", relation: "friend" },
  { name: "Jess", relation: "bestie" },
  { name: "" },
  "nope",
]);
assert.deepEqual(contacts, [
  { name: "Mom", relation: "family", note: "worries a lot" },
  { name: "Jess", relation: "other", note: "" },
]);
assert.deepEqual(shared.readForkPhoneSettings({}).contacts, [], "no contacts by default");
assert.equal(shared.readForkPhoneSettings({ forkPhone: { contacts } }).contacts.length, 2);
assert.equal(
  shared.normalizeForkPhoneContacts(Array.from({ length: 40 }, (_, index) => ({ name: `c${index}` }))).length,
  shared.MAX_FORK_PHONE_CONTACTS,
);

// ── The phone agent ──
const cast = [{ id: "theo", name: "Theo" }];
const sideFor = agent.phoneSideResolver("Kyli", cast, ["Mom"]);
assert.equal(sideFor("mom"), "contact:Mom", "a saved contact is found whatever the case");
assert.equal(sideFor("Dad"), "contact:Dad");
const answer = agent.readPhoneAgentAnswer(
  JSON.stringify({
    texts: [
      { from: "mom", body: "ARE YOU EATING" },
      { from: "Dad", body: "not in your phone" },
      { from: "Theo", body: "hi" },
    ],
    calls: [{ from: "Mom", about: "contacts do not call on their own" }],
  }),
  sideFor,
  new Set(["contact:Mom"]),
);
assert.deepEqual(
  answer.texts.map((text) => text.from),
  ["contact:Mom", "theo"],
  "your contacts can text you; someone you never saved cannot",
);
assert.equal(answer.calls.length, 0);
const agentPrompt = agent.buildPhoneAgentMessages({
  personaName: "Kyli",
  cast: [{ name: "Theo", about: "", present: true }],
  date: "",
  time: "",
  location: "",
  people: "",
  story: "",
  phones: "",
  owed: [],
  queue: [],
  call: "",
  contacts: contacts.map(prompt.contactLine),
})[0]!.content;
assert.match(
  agentPrompt,
  /Kyli's own contacts .*they know only what Kyli texted them and what they themselves did, wrote or said in the story, like a letter they sent\):\n- Mom \(family\): worries a lot\n- Jess \(contact\)/,
);

// ── A contact's answer ──
const reply = agent.buildContactReplyMessages({
  name: "Mom",
  who: prompt.contactWho(contacts[0]!, "Kyli"),
  personaName: "Kyli",
  storyTime: "11 PM",
  texts: [{ name: "Kyli", text: "home safe", time: "11 PM" }],
})[0]!.content;
assert.match(reply, /Mom is Kyli's family \(worries a lot\)/);
assert.match(reply, /knows nothing about Kyli's day except what Kyli has texted them/);
assert.doesNotMatch(reply, /latest story|scene:/i, "a contact is never shown the story's scenes");
assert.match(reply, /- \[11 PM\] Kyli: home safe/);
assert.deepEqual(agent.readContactReply('{"texts":["GOOD", " \\"call me tomorrow\\" ", "", "x", "y"]}'), [
  "GOOD",
  "call me tomorrow",
  "x",
]);
assert.deepEqual(agent.readContactReply("ok sweetie\nlove you"), ["ok sweetie", "love you"], "plain lines work too");
// ── What a contact knows from the story: only passages naming them, and only their own part ──
const passages = [
  "Kyli opened a letter. It was from Deidra, her cousin. I got your address from someone at the club.",
  "Kyli texted Molly about her day.",
  "Maria brought in the mail.",
  "Deidrasaurus is not a name.",
];
assert.deepEqual(
  agent.passagesNaming("Deidra cousin", passages),
  [passages[0]],
  "a contact is found by first name too",
);
assert.deepEqual(agent.passagesNaming("Mom", passages), [], "no passage names Mom");
assert.deepEqual(agent.passagesNaming("Molly", ["Molly 1", "Molly 2", "Molly 3", "Molly 4"]), [
  "Molly 2",
  "Molly 3",
  "Molly 4",
]);
const knows = agent.contactStoryBlock("Deidra", "Kyli", [passages[0]!]);
assert.match(knows, /Deidra knows only their own part: what they themselves did, wrote or said/);
assert.match(knows, /what Kyli or anyone else did, saw, thought or found out\) Deidra does not know/);
assert.match(knows, /someone at the club/);
assert.equal(agent.contactStoryBlock("Deidra", "Kyli", []), "", "nothing when the story never names them");
const knowing = agent.buildContactReplyMessages({
  name: "Deidra",
  who: "Kyli's family",
  personaName: "Kyli",
  storyTime: "",
  texts: [{ name: "Kyli", text: "how did you get my address?", time: "" }],
  knows,
})[0]!.content;
assert.match(knowing, /plus their own life and their own part in the passages below/);
assert.match(knowing, /someone at the club/);

const call = agent.buildCallLineMessages({
  characterName: "Mom",
  who: prompt.contactWho(contacts[0]!, "Kyli"),
  about: "",
  personaName: "Kyli",
  story: "",
  lines: [],
})[0]!.content;
assert.match(call, /Mom is Kyli's family \(worries a lot\)\. They only know what Kyli has told them/);

// ── The writer ──
const block = prompt.phonePromptBlock([], [], "Kyli", () => "", contacts.map(prompt.contactLine));
assert.match(block, /Kyli's contacts \(no part in the scenes.*\):\n- Mom \(family\): worries a lot/);
assert.equal(
  prompt.phonePromptBlock([], [], "Kyli", () => ""),
  "",
  "no contacts and no texts, no block",
);

// ── Deleting a contact's conversation ──
const db = await getDB();
registerForkTables([phone.phoneThreads, phone.phoneMessages]);
const store = phone.createPhoneStorage(db);
const thread = await store.ensureThread("c1", "persona", "contact:Mom");
await store.addMessage({ chatId: "c1", threadId: thread.id, sender: "persona", body: "home safe" });
await store.addMessage({ chatId: "c1", threadId: thread.id, sender: "contact:Mom", body: "GOOD", source: "agent" });
const keep = await store.ensureThread("c1", "persona", "theo");
await store.addMessage({ chatId: "c1", threadId: keep.id, sender: "persona", body: "hi" });
await store.removeThread(thread.id);
assert.deepEqual(
  (await store.listMessages("c1")).map((message) => message.body),
  ["hi"],
);
assert.deepEqual(
  (await store.listThreads("c1")).map((entry) => entry.id),
  [keep.id],
);
await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork phone contacts: ok");
