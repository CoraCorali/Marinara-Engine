/**
 * Fork: Pocket Phone, part 2. The phone agent's answer is read safely (names become sides, the
 * persona's words are never written for them); texts arrive now or after 1–3 replies; the daily cap
 * and the per-character cooldown hold, except for answering your text; one call rings at a time; a
 * swipe or delete of a reply takes back what its run did; idle delivery sends what waits; the agent
 * is skipped while everyone is present and nothing waits; the writer sees a call's last lines.
 */
import assert from "node:assert/strict";

const agent = await import("../../packages/server/src/services/phone/fork-phone-agent.js");
const { phonePromptBlock } = await import("../../packages/server/src/services/phone/fork-phone-prompt.js");

const cast = [
  { id: "theo", name: "Theo Marchetti" },
  { id: "mira", name: "Mira" },
];
const sideFor = agent.phoneSideResolver("Kyli", cast);
assert.equal(sideFor("Theo"), "theo", "a first name finds the card");
assert.equal(sideFor("kyli"), "persona");
assert.equal(sideFor("Mom"), "contact:Mom");

let ids = 0;
const newId = () => `q${++ids}`;
const empty = agent.readPhoneRunState({});
assert.deepEqual([empty.queue, empty.runs, empty.call], [[], [], null]);

// ── Reading the agent ──
const answer = agent.readPhoneAgentAnswer(
  'Sure! {"texts":[{"from":"Theo","body":"you left your scarf","when":"now"},{"from":"Kyli","body":"not mine to write"},' +
    '{"from":"Mira","body":"later text","when":"later","after":9}],"calls":[{"from":"Mom","about":"x"}],' +
    '"threads":[{"from":"Theo","to":"Mira","body":"she smiled at me"},{"from":"Theo","to":"Kyli","body":"wrong place"},' +
    '{"from":"Mom","to":"Dad","body":"no card on either side"}],"drafts":[{"from":"Theo","to":"Kyli","body":"i miss"}],' +
    '"queue":{"send":[],"drop":[]},"reachable":["Theo","Mom"]}',
  sideFor,
);
assert.deepEqual(
  answer.texts.map((text) => [text.from, text.when, text.after]),
  [
    ["theo", "now", 0],
    ["mira", "later", 3],
  ],
  "the persona never texts through the agent, and later waits at most 3 replies",
);
assert.equal(answer.calls.length, 0, "a side contact cannot call you");
assert.deepEqual(
  answer.threads.map((line) => line.to),
  ["mira"],
  "threads are between others, with a card on one side",
);
assert.deepEqual(answer.reachable, ["theo"]);
assert.deepEqual(agent.readPhoneAgentAnswer("no json here", sideFor).texts, []);

// ── A run: now arrives, later waits ──
let plan = agent.planPhoneRun({ state: empty, answer, replyId: "r1", day: "Oct 14", owed: new Set(), newId });
assert.deepEqual(
  plan.deliver.map((item) => [item.kind, item.from, item.body]),
  [["text", "theo", "you left your scarf"]],
);
assert.equal(plan.state.queue.length, 1);
assert.equal(plan.state.queue[0]!.after, 3);
let state = plan.state;

const nothing = { texts: [], calls: [], threads: [], drafts: [], send: [], drop: [], reachable: [] };
for (const reply of ["r2", "r3"]) {
  plan = agent.planPhoneRun({ state, answer: nothing, replyId: reply, day: "Oct 14", owed: new Set(), newId });
  assert.equal(plan.deliver.length, 0, `still waiting after ${reply}`);
  state = plan.state;
}
plan = agent.planPhoneRun({ state, answer: nothing, replyId: "r4", day: "Oct 14", owed: new Set(), newId });
assert.deepEqual(
  plan.deliver.map((item) => item.body),
  ["later text"],
  "arrives three replies later",
);
assert.equal(plan.state.queue[0]!.deliveredAt, "r4");

// ── A swipe of r4 puts the text back in the queue; the next run of r4 sends it again ──
const rewound = agent.rewindPhoneRun(plan.state, ["r4"]);
assert.equal(rewound.queue[0]!.deliveredAt, "");
assert.ok(!rewound.runs.includes("r4"));
assert.equal(agent.dueQueueItems({ ...rewound, runs: [...rewound.runs, "r4"] }).length, 1);
// A swipe of r1 takes back what r1 queued.
assert.equal(agent.rewindPhoneRun(state, ["r1"]).queue.length, 0);

// ── Cooldown, unless answering your text ──
const theoAgain = { ...nothing, texts: [{ from: "theo", body: "again", when: "now" as const, after: 0 }] };
const afterR1 = agent.planPhoneRun({
  state: empty,
  answer: theoAgain,
  replyId: "r1",
  day: "d",
  owed: new Set(),
  newId,
});
const cooled = agent.planPhoneRun({
  state: afterR1.state,
  answer: theoAgain,
  replyId: "r2",
  day: "d",
  owed: new Set(),
  newId,
});
assert.equal(cooled.deliver.length, 0, "Theo just texted unprompted, so he waits");
const answering = agent.planPhoneRun({
  state: afterR1.state,
  answer: theoAgain,
  replyId: "r2",
  day: "d",
  owed: new Set(["theo"]),
  newId,
});
assert.equal(answering.deliver.length, 1, "answering your text is always allowed");
let later = afterR1.state;
for (const reply of ["r2", "r3"]) {
  later = agent.planPhoneRun({ state: later, answer: nothing, replyId: reply, day: "d", owed: new Set(), newId }).state;
}
assert.equal(
  agent.planPhoneRun({ state: later, answer: theoAgain, replyId: "r4", day: "d", owed: new Set(), newId }).deliver
    .length,
  1,
  "the cooldown passes",
);

// ── Daily cap and one call at a time ──
const crowded = {
  ...empty,
  log: Array.from({ length: agent.PHONE_DAILY_CAP }, (_, index) => ({
    reply: `old${index}`,
    day: "d",
    from: "mira",
    prompted: true,
  })),
};
assert.equal(
  agent.planPhoneRun({ state: crowded, answer: theoAgain, replyId: "r9", day: "d", owed: new Set(["theo"]), newId })
    .deliver.length,
  0,
  "nothing gets past the daily cap",
);
assert.equal(
  agent.planPhoneRun({ state: crowded, answer: theoAgain, replyId: "r9", day: "next day", owed: new Set(), newId })
    .deliver.length,
  1,
  "a new story day starts fresh",
);
const ringing = {
  ...empty,
  call: { id: "c1", from: "mira", about: "", opening: "", state: "ringing" as const, reply: "r0" },
};
const twoCalls = agent.planPhoneRun({
  state: ringing,
  answer: { ...nothing, calls: [{ from: "theo", about: "the umbrella", opening: "hey", when: "now", after: 0 }] },
  replyId: "r1",
  day: "d",
  owed: new Set(),
  newId,
});
assert.equal(twoCalls.deliver.length, 0);
assert.equal(twoCalls.state.queue[0]?.kind, "call", "a second call waits for the next reply");
assert.equal(agent.rewindPhoneRun(ringing, ["r0"]).call, null, "a swipe takes back the ringing call");

// ── Dropped and idle ──
const dropped = agent.planPhoneRun({
  state: plan.state,
  answer: { ...nothing, drop: [state.queue[0]!.id] },
  replyId: "r5",
  day: "Oct 14",
  owed: new Set(),
  newId,
});
assert.equal(dropped.state.queue.length, 1, "a delivered item stays until its reply is too old to swipe");
const waiting = agent.planPhoneRun({ state: empty, answer, replyId: "r1", day: "d", owed: new Set(), newId }).state;
const idle = agent.planIdleDelivery(waiting, "r1", "d");
assert.deepEqual(
  idle.deliver.map((item) => item.body),
  ["later text"],
);
assert.deepEqual(idle.state.runs, waiting.runs, "waiting in the chat does not count as a reply");
const droppedEarly = agent.planPhoneRun({
  state: waiting,
  answer: { ...nothing, drop: [waiting.queue[0]!.id] },
  replyId: "r2",
  day: "d",
  owed: new Set(),
  newId,
});
assert.equal(droppedEarly.state.queue.length, 0, "a time skip can drop a waiting text");

// ── Skipping the agent ──
const skip = (presentIds: string[], stateIn = empty, owed = new Set<string>()) =>
  agent.shouldSkipPhoneRun({ castIds: ["theo", "mira"], presentIds, state: stateIn, owed });
assert.equal(skip(["theo", "mira"]), true, "everyone is here and nothing waits");
assert.equal(skip(["theo"]), false, "Mira is away");
assert.equal(skip(["theo", "mira"], waiting), false, "a text is waiting");
assert.equal(skip(["theo", "mira"], empty, new Set(["theo"])), false, "your text needs an answer");

// ── Metadata round trip ──
const stored = agent.readPhoneRunState(JSON.parse(JSON.stringify(agent.phoneRunMetadata(twoCalls.state))));
assert.deepEqual(stored.queue, twoCalls.state.queue);
assert.deepEqual(stored.call, twoCalls.state.call);

// ── Calls in the writer's block ──
const thread = { id: "t1", chatId: "c", a: "persona", b: "theo", createdAt: "", updatedAt: "" };
const base = {
  threadId: "t1",
  chatId: "c",
  storyTime: "9 PM",
  afterMessageId: "",
  source: "agent" as const,
  swipes: [],
  activeSwipe: 0,
  read: true,
  createdAt: "",
  updatedAt: "",
};
const block = phonePromptBlock(
  [thread],
  [
    { ...base, id: "call1", sender: "theo", body: "the umbrella", kind: "call" as const, callId: "" },
    { ...base, id: "l1", sender: "theo", body: "you still up?", kind: "call_line" as const, callId: "call1" },
    { ...base, id: "l2", sender: "persona", body: "yeah", kind: "call_line" as const, callId: "call1" },
  ],
  "Kyli",
  () => "Theo",
);
assert.match(block, /Theo called Kyli at 9 PM: the umbrella\n {2}Theo: you still up\?\n {2}Kyli: yeah/);

// ── Prompts ──
const prompt = agent.buildPhoneAgentMessages({
  personaName: "Kyli",
  cast: [{ name: "Theo", about: "a baker", present: false }],
  date: "Oct 14",
  time: "9 PM",
  location: "the bakery",
  people: "",
  story: "Theo: goodnight",
  phones: "",
  owed: ["Theo"],
  queue: [{ id: "q1", who: "Theo", kind: "text", body: "hi", status: "waiting" }],
  call: "",
});
assert.equal(prompt.length, 1);
assert.equal(prompt[0]!.role, "user");
assert.match(prompt[0]!.content, /Theo \(not in the scene\): a baker/);
assert.match(prompt[0]!.content, /Kyli texted Theo and is waiting/);
assert.match(prompt[0]!.content, /q1 · Theo · text · waiting: hi/);
assert.match(prompt[0]!.content, /Never write Kyli's texts/);
const untracked = agent.buildPhoneAgentMessages({
  personaName: "Kyli",
  cast: [{ name: "Theo", about: "", present: null }],
  date: "",
  time: "",
  location: "",
  people: "",
  story: "",
  phones: "",
  owed: [],
  queue: [],
  call: "",
})[0]!.content;
assert.match(untracked, /- Theo\n/, "no presence list: nobody is called away");
assert.match(untracked, /Judge from the story who is in the scene/);
assert.equal(agent.cleanSpokenLine('Theo: "hey, you."', "Theo"), "hey, you.");

// ── A branch keeps only what came before its branch point ──
const source = {
  ...empty,
  queue: [
    {
      id: "q-a",
      kind: "text" as const,
      from: "theo",
      body: "kept",
      opening: "",
      fromReply: "r1",
      after: 1,
      deliveredAt: "r2",
    },
    {
      id: "q-b",
      kind: "text" as const,
      from: "theo",
      body: "after",
      opening: "",
      fromReply: "r3",
      after: 1,
      deliveredAt: "",
    },
  ],
  runs: ["r1", "r2", "r3"],
  log: [
    { reply: "r1", day: "d", from: "theo", prompted: false },
    { reply: "r3", day: "d", from: "theo", prompted: false },
  ],
  call: { id: "c", from: "theo", about: "", opening: "", state: "live" as const, reply: "r1" },
  reachable: { reply: "r3", ids: ["theo"] },
  peeks: [
    { characterId: "theo", reply: "r1", storyTime: "", threadIds: ["t1", "drafts"], at: "" },
    { characterId: "theo", reply: "r3", storyTime: "", threadIds: [], at: "" },
  ],
};
const branched = agent.branchPhoneRunState(source, new Map([["r1", "b1"]]), new Map([["t1", "bt1"]]));
assert.deepEqual(
  branched.queue.map((item) => [item.id, item.fromReply, item.deliveredAt]),
  [["q-a", "b1", ""]],
  "a text queued before the branch point waits again there; one queued after it is not in the branch",
);
assert.deepEqual(branched.runs, ["b1"]);
assert.deepEqual(
  branched.log.map((entry) => entry.reply),
  ["b1"],
);
assert.equal(branched.call, null);
assert.equal(branched.reachable, null, "a phone left in reach after the branch point is not in the branch");
assert.deepEqual(branched.peeks, [
  { characterId: "theo", reply: "b1", storyTime: "", threadIds: ["bt1", "drafts"], at: "" },
]);

console.log("fork phone agent: ok");
