/**
 * Fork: the Director's chair endpoint. Off-record talk that returns a reply plus the note the
 * chat can apply as a guided regeneration.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-director-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { buildGuidedGenerationInstructionMessage, stripGenerationGuideInstruction } =
  await import("../../packages/shared/src/index.js");

// The note becomes a guided instruction, which generation already understands, and reads back out.
const note = "He goes quiet, checks the truck, then snaps about the insurance. No hug.";
const instruction = buildGuidedGenerationInstructionMessage(note);
assert.ok(instruction.includes(note), "the note reaches the writer model");
assert.ok(instruction.includes("do not include a reply from {{user}}"), "the direction never speaks for the user");
assert.equal(stripGenerationGuideInstruction(instruction), note, "the note reads back out for display");

// A note with stray whitespace is trimmed rather than carried into the prompt.
assert.equal(stripGenerationGuideInstruction(buildGuidedGenerationInstructionMessage(`  ${note}  `)), note);

// ── The endpoint's own reply parsing ──
// The route asks for JSON but keeps the model's words when it answers in plain prose instead.
function readDirectorReply(raw: string): { say: string; note: string } {
  let say = raw.trim();
  let parsedNote = "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { say?: unknown; note?: unknown };
      if (typeof parsed.say === "string" && parsed.say.trim()) say = parsed.say.trim();
      if (typeof parsed.note === "string") parsedNote = parsed.note.trim();
    } catch {
      /* keep the raw text */
    }
  }
  return { say, note: parsedNote };
}

const clean = readDirectorReply('{"say":"Fair, his card says he is short-tempered.","note":"' + note + '"}');
assert.equal(clean.note, note);
assert.ok(clean.say.startsWith("Fair,"));

// Models often wrap JSON in prose or a code fence; both still parse.
const fenced = readDirectorReply('Sure!\n```json\n{"say":"Got it.","note":"Keep it short."}\n```');
assert.equal(fenced.say, "Got it.");
assert.equal(fenced.note, "Keep it short.");

// Plain prose with no JSON is still shown to the writer, with no note yet.
const prose = readDirectorReply("He would absolutely be annoyed about the truck.");
assert.equal(prose.say, "He would absolutely be annoyed about the truck.");
assert.equal(prose.note, "", "no note until something is decided");

// Broken JSON must not lose the model's answer.
const broken = readDirectorReply('{"say":"Half a thought"');
assert.ok(broken.say.includes("Half a thought"));

// ── What the Director is shown ──
const { buildDirectorContext, DIRECTOR_SCENE_MESSAGES } =
  await import("../../packages/server/src/services/generation/fork-director-context.js");

const full = buildDirectorContext({
  cards: [{ name: "Theo", description: "<p>A ranch hand.</p>", personality: "Short-tempered" }],
  persona: { name: "Kyli", description: "Twenty-eight, a vet tech." },
  lore: [{ name: "The ranch", content: "Forty acres outside Bisbee." }],
  summary: "They met at the feed store in April and have been circling each other since.",
  scene: [
    { role: "user", content: "I set the keys on the counter." },
    { role: "assistant", content: "He does not look up." },
  ],
});

// All four sources she asked about reach the model, each under its own heading.
for (const tag of ["<characters>", "<the_writers_character>", "<lore_in_play>", "<story_so_far>", "<recent_scene>"]) {
  assert.ok(full.includes(tag), `${tag} is in the context`);
}
assert.ok(full.includes("Name: Theo"), "the card's name");
assert.ok(full.includes("Description: A ranch hand."), "markup is stripped out of a card");
assert.ok(!full.includes("<p>"), "no card markup survives into the prompt");
assert.ok(full.includes("Personality: Short-tempered"), "the card's personality");
assert.ok(full.includes("Name: Kyli"), "who the writer plays");
assert.ok(full.includes("The ranch: Forty acres outside Bisbee."), "a lore entry reads as name and content");
assert.ok(full.includes("feed store in April"), "the chat's running summary");
assert.ok(full.includes("Writer: I set the keys on the counter."), "the writer's own turn is labelled as theirs");
assert.ok(full.includes("Story: He does not look up."), "a reply reads as the story");
// Order matters: background first, then what just happened.
const positions = ["<characters>", "<the_writers_character>", "<lore_in_play>", "<story_so_far>", "<recent_scene>"].map(
  (tag) => full.indexOf(tag),
);
for (const [index, position] of positions.slice(1).entries()) {
  assert.ok(position > positions[index]!, "the context reads from background to the last message");
}

// Narration is the story too, not something the writer said.
const narrated = buildDirectorContext({
  cards: [],
  scene: [{ role: "narrator", content: "Rain on the tin roof." }],
});
assert.ok(narrated.includes("Story: Rain on the tin roof."));

// A chat with no persona, no lore and no summary sends no empty tags.
const bare = buildDirectorContext({
  cards: [{ name: "Theo" }],
  scene: [{ role: "user", content: "hi" }],
});
assert.ok(bare.includes("<characters>"));
for (const tag of ["<the_writers_character>", "<lore_in_play>", "<story_so_far>"]) {
  assert.ok(!bare.includes(tag), `${tag} is left out when there is nothing to put in it`);
}
// Nothing at all is an empty string, so the route sends the system prompt alone.
assert.equal(buildDirectorContext({ cards: [], scene: [] }), "");
// A blank message is dropped rather than sent as a bare label.
assert.ok(!buildDirectorContext({ cards: [], scene: [{ role: "user", content: "   " }] }).includes("Writer:"));

// The reply being discussed is read whole, so "the ending felt off" has an ending to look at.
// Older messages are cut shorter, since they are only background.
const longReply = `${"He talks. ".repeat(400)}THE ENDING`;
const longScene = buildDirectorContext({
  cards: [],
  scene: [
    { role: "assistant", content: `${"Old news. ".repeat(400)}OLD TAIL` },
    { role: "user", content: "I wait." },
    { role: "assistant", content: longReply },
  ],
});
assert.ok(longScene.includes("THE ENDING"), "the newest reply is not cut short");
assert.ok(!longScene.includes("OLD TAIL"), "an older message is still capped");

// Relationships and pinned pictures reach the Director, kept as lines.
const withStanding = buildDirectorContext({
  cards: [],
  scene: [{ role: "user", content: "hi" }],
  standing: "Where things stand:\n- Theo: Romantic, dating.",
});
assert.ok(
  withStanding.includes("<where_things_stand>\nWhere things stand:\n- Theo: Romantic, dating.\n</where_things_stand>"),
);
assert.ok(!bare.includes("<where_things_stand>"), "no relationships, no tag");

// A huge board of lore cannot push the scene out of the prompt.
const manyEntries = Array.from({ length: 40 }, (_, index) => ({
  name: `Entry ${index}`,
  content: `Fact ${index}`,
}));
const capped = buildDirectorContext({ cards: [], lore: manyEntries, scene: [] });
assert.ok(capped.includes("Entry 0: Fact 0"));
assert.ok(!capped.includes("Entry 39"), "the lore block is capped");

// ── Lore really is reachable for a chat, not just formattable ──
const { getDB, closeDB } = await import("../../packages/server/src/db/connection.js");
const { createLorebooksStorage } = await import("../../packages/server/src/services/storage/lorebooks.storage.js");
const { scanForActivatedEntries } = await import("../../packages/server/src/services/lorebook/keyword-scanner.js");
const { applyTokenBudget } = await import("../../packages/server/src/services/lorebook/prompt-injector.js");

const db = await getDB();
const lorebooks = createLorebooksStorage(db);
const chatId = "director-chat";
const book = await lorebooks.create({ name: "Bisbee", chatId });
assert.ok(book);
await lorebooks.createEntry({ lorebookId: book!.id, name: "The ranch", content: "Forty acres", keys: ["ranch"] });
await lorebooks.createEntry({ lorebookId: book!.id, name: "Her truck", content: "A dented F-150", keys: ["truck"] });
await lorebooks.createEntry({ lorebookId: book!.id, name: "The weather", content: "Monsoon season", constant: true });

const scene = [
  { role: "user", content: "I pull up to the ranch." },
  { role: "assistant", content: "He is on the porch." },
];
const entries = (await lorebooks.listActiveEntries({ chatId, characterIds: [], personaId: null })) as never[];
const activated = applyTokenBudget(
  scanForActivatedEntries(scene, entries, { scanDepth: DIRECTOR_SCENE_MESSAGES, ignoreTiming: true }),
  2048,
);
const names = activated.map((match) => match.entry.name).sort();
assert.deepEqual(names, ["The ranch", "The weather"], "a keyword in the scene and a constant entry both activate");
assert.ok(!names.includes("Her truck"), "lore the scene never mentions stays out");

const withLore = buildDirectorContext({
  cards: [],
  lore: activated.map((match) => ({ name: match.entry.name, content: match.entry.content })),
  scene,
});
assert.ok(withLore.includes("The ranch: Forty acres"), "the scanned entry reaches the context");

// ── The summary comes from the chat, and only in Roleplay ──
const { resolveRoleplayChatSummary } =
  await import("../../packages/server/src/services/generation/roleplay-summary-retrieval.js");
const storySoFar = "She moved into the bunkhouse in May.";
assert.equal(resolveRoleplayChatSummary("roleplay", { summary: storySoFar }), storySoFar);
assert.equal(resolveRoleplayChatSummary("roleplay", {}), null, "no summary yet reads as nothing");
assert.equal(resolveRoleplayChatSummary("conversation", { summary: storySoFar }), null, "Roleplay only");

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork director: ok");
