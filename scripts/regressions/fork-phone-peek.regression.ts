/**
 * Fork: Pocket Phone, part 3. A character's written phone is read safely (never the persona's
 * thread or a thread with themselves, within the caps, a look from the approved skins); the writer
 * is told what the persona saw while peeking (the list, plus every conversation opened); a swipe of
 * the reply that left the phone within reach takes the peek back; peeks survive the metadata round
 * trip; the write prompt keeps the persona's thread out.
 */
import assert from "node:assert/strict";

const agent = await import("../../packages/server/src/services/phone/fork-phone-agent.js");
const peek = await import("../../packages/server/src/services/phone/fork-phone-peek.js");

const cast = [
  { id: "theo", name: "Theo" },
  { id: "mira", name: "Mira" },
];
const sideFor = agent.phoneSideResolver("Kyli", cast);

// ── Reading a written phone ──
const written = peek.readWrittenPhone(
  JSON.stringify({
    look: { skin: "candybar", color: "midnight", gems: true, stickers: true },
    threads: [
      {
        with: "Mira",
        texts: [
          { from: "me", body: "the umbrella girl came by again", time: "9 PM" },
          { from: "Mira", photo: "the sign" },
        ],
      },
      { with: "Kyli", texts: [{ from: "me", body: "not allowed: the real thread" }] },
      { with: "Theo", texts: [{ from: "me", body: "a thread with himself" }] },
      { with: "Mom", texts: [{ from: "Mom", body: "did you eat" }] },
      { with: "Mom", texts: [{ from: "Mom", body: "duplicate thread" }] },
      { with: "Empty", texts: [] },
    ],
    drafts: [
      { to: "Kyli", body: "i keep thinking about" },
      { to: "Theo", body: "to himself" },
    ],
    photos: Array.from({ length: 9 }, (_, index) => `photo ${index}`),
    calls: [
      { with: "Mom", about: "rent", missed: true, time: "Tue" },
      { with: "Kyli", about: "not here" },
    ],
  }),
  "theo",
  sideFor,
)!;
assert.deepEqual(
  written.threads.map((thread) => thread.with),
  ["mira", "contact:Mom"],
  "no persona thread, no thread with themselves, no duplicates or empty threads",
);
assert.deepEqual(written.threads[0]!.texts[1], { mine: false, body: "the sign", time: "", photo: true });
assert.equal(written.threads[0]!.texts[0]!.mine, true);
assert.deepEqual(
  written.drafts.map((draft) => draft.to),
  ["persona"],
  "a draft to the persona is allowed (it stays unsent); one to themselves is not",
);
assert.equal(written.photos.length, peek.WRITTEN_PHOTOS_MAX);
assert.deepEqual(
  written.calls.map((call) => [call.with, call.missed]),
  [["contact:Mom", true]],
);
assert.equal(written.look?.skin, "candybar");
assert.equal(written.look?.color, "sky", "a colour the skin does not come in falls back to its first");
assert.equal(written.look?.stickers, true);
assert.equal(peek.readWrittenPhone("no json", "theo", sideFor), null);
assert.deepEqual(
  peek.parseLooseJson('{"photos":["a","b"]},"calls":[{"with":"Mom"}]}'),
  { photos: ["a", "b"], calls: [{ with: "Mom" }] },
  "a stray closing bracket in the middle is forgiven",
);
assert.equal(peek.parseLooseJson('{"a": nope}'), null);
assert.equal(
  peek.readWrittenPhone('{"look":{"skin":"flip"}}', "theo", sideFor)?.look,
  null,
  "an unknown skin is not used",
);
assert.deepEqual(peek.readWrittenPhones({ forkPhoneWritten: { theo: { photos: ["a", 3, ""] } } }), {
  theo: { photos: ["a"] },
});

// ── Peeks in the run state ──
const state = agent.readPhoneRunState({
  forkPhonePeeks: [
    { characterId: "theo", reply: "r1", storyTime: "9 PM", threadIds: ["t-mira"], at: "" },
    { bad: true },
  ],
});
assert.equal(state.peeks.length, 1);
assert.equal(agent.rewindPhoneRun(state, ["r1"]).peeks.length, 0, "a swipe of the reply takes the peek back");
assert.equal(agent.rewindPhoneRun(state, ["r2"]).peeks.length, 1);
assert.deepEqual(agent.readPhoneRunState(JSON.parse(JSON.stringify(agent.phoneRunMetadata(state)))).peeks, state.peeks);

// ── What the writer is told ──
const base = {
  chatId: "c",
  storyTime: "",
  afterMessageId: "",
  source: "agent" as const,
  callId: "",
  swipes: [],
  activeSwipe: 0,
  read: true,
  createdAt: "",
  updatedAt: "",
};
const threads = [
  { id: "t-mira", chatId: "c", a: "mira", b: "theo", createdAt: "", updatedAt: "" },
  { id: "t-mom", chatId: "c", a: "contact:Mom", b: "theo", createdAt: "", updatedAt: "" },
  { id: "t-kyli", chatId: "c", a: "persona", b: "theo", createdAt: "", updatedAt: "" },
];
const messages = [
  {
    ...base,
    id: "1",
    threadId: "t-mira",
    sender: "theo",
    body: "the umbrella girl came by again",
    kind: "text" as const,
  },
  { ...base, id: "2", threadId: "t-mira", sender: "mira", body: "and??", kind: "text" as const },
  { ...base, id: "3", threadId: "t-mom", sender: "contact:Mom", body: "did you eat", kind: "text" as const },
  { ...base, id: "4", threadId: "t-kyli", sender: "theo", body: "i keep thinking about", kind: "draft" as const },
];
const names = (side: string) =>
  side === "persona" ? "Kyli" : side === "theo" ? "Theo" : side === "mira" ? "Mira" : side.replace("contact:", "");
const block = peek.peekPromptBlock(state.peeks, threads, messages, "Kyli", names);
assert.match(block, /Kyli looked at Theo's phone at 9 PM without asking/);
assert.match(block, /- Mira — Mira: and\?\?/, "the list shows each conversation's newest line");
assert.match(block, /- Mom — Mom: did you eat/);
assert.doesNotMatch(block, /i keep thinking about/, "drafts are only seen when Drafts is opened");
const withScreens = peek.peekPromptBlock(
  [{ ...state.peeks[0]!, threadIds: ["drafts", "photos"] }],
  threads,
  messages,
  "Kyli",
  names,
  () => ["flour handprint on the counter"],
);
assert.match(withScreens, /Kyli opened Theo's unsent drafts:\n {2}to Kyli: i keep thinking about/);
assert.match(withScreens, /Kyli opened Theo's photos:\n {2}flour handprint on the counter/);
assert.match(
  block,
  /Kyli opened the conversation with Mira:\n {2}Theo: the umbrella girl came by again\n {2}Mira: and\?\?/,
);
assert.doesNotMatch(block, /opened the conversation with Mom/, "only opened conversations are read in full");
assert.match(block, /Whether anyone noticed the look is up to the story/);
assert.doesNotMatch(block, /\b(she|her|he|his)\b/i, "no pronouns assumed for the persona");
assert.equal(peek.peekPromptBlock([], threads, messages, "Kyli", names), "");
// Looking twice reads as one look; texts that arrived after the last look were not seen.
const twice = peek.peekPromptBlock(
  [
    { characterId: "theo", reply: "r1", storyTime: "9 PM", threadIds: ["t-mira"], at: "2026-10-14T10:00:00.000Z" },
    { characterId: "theo", reply: "r2", storyTime: "9:20 PM", threadIds: ["t-mom"], at: "2026-10-14T10:05:00.000Z" },
  ],
  threads,
  [
    ...messages.map((message) => ({ ...message, createdAt: "2026-10-14T09:00:00.000Z" })),
    {
      ...base,
      id: "5",
      threadId: "t-mira",
      sender: "mira",
      body: "later text",
      kind: "text" as const,
      createdAt: "2026-10-14T11:00:00.000Z",
    },
  ],
  "Kyli",
  names,
);
assert.equal(twice.match(/looked at Theo's phone/g)?.length, 1);
assert.match(twice, /at 9:20 PM/);
assert.match(twice, /opened the conversation with Mira/);
assert.match(twice, /opened the conversation with Mom/);
assert.doesNotMatch(twice, /later text/, "texts after the look were not seen");

// ── The write prompt ──
const prompt = peek.buildPhoneWriteMessages({
  ownerName: "Theo",
  ownerAbout: "a quiet baker",
  personaName: "Kyli",
  others: ["Mira"],
  people: "",
  story: "Theo: goodnight",
  existing: "With Mira:\n- Theo: hi",
})[0]!;
assert.equal(prompt.role, "user");
assert.match(prompt.content, /Never write texts between Theo and Kyli/);
assert.match(prompt.content, /slider \(pink-pearl, midnight, mint, lilac\)/);
assert.match(prompt.content, /Already on the phone \(keep consistent/);

console.log("fork phone peek: ok");
