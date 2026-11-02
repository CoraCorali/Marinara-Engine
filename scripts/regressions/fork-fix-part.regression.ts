/**
 * Fork: Fix this part and the slop highlighter. Finding phrases, finding a passage picked on screen
 * in the stored reply, and the rewrite request and its cleanup.
 */
import assert from "node:assert/strict";

const { DEFAULT_SLOP_PHRASES, findSlopMatches, locatePassage, passageOccurrence, replacePassage, sentenceAround } =
  await import("../../packages/client/src/lib/fork/slop.js");
const { buildFixPartMessages, isValidFixRange, readFixPartReply, DEFAULT_FIX_INSTRUCTION } =
  await import("../../packages/server/src/services/generation/fork-fix-part.js");

// ── Finding slop ──
const prose = "A Shiver down her spine. She couldn’t help but smile, a mix of fear and joy. Electricity hummed.";
const found = findSlopMatches(prose, [
  "shiver down her spine",
  "shiver down",
  "couldn't help but",
  "a mix of",
  "electric",
]);
assert.deepEqual(
  found.map((match) => prose.slice(match.start, match.end)),
  ["Shiver down her spine", "couldn’t help but", "a mix of"],
  "case-insensitive, curly apostrophes match, the longer phrase wins, and whole words only (not 'Electricity')",
);
assert.equal(findSlopMatches(prose, []).length, 0);
assert.equal(findSlopMatches("", DEFAULT_SLOP_PHRASES).length, 0);
assert.ok(DEFAULT_SLOP_PHRASES.length > 20, "a real starter list");
// A phrase with regex characters is matched literally.
assert.equal(findSlopMatches("maybe, just maybe (it worked)", ["maybe, just maybe", "(it"]).length, 2);

// ── Finding a picked passage in the stored reply ──
const stored = '*She leans in,* her voice **barely above a whisper**. "Stay," she says.\n\nThe rain keeps on.';
// The screen shows rendered markdown: no asterisks, curly quotes.
const onScreen = "her voice barely above a whisper. “Stay,” she";
const located = locatePassage(stored, onScreen);
assert.ok(located, "the rendered passage is found in the stored text");
assert.equal(stored.slice(located!.start, located!.end), 'her voice **barely above a whisper**. "Stay," she');
// A passage wrapped in bold or italics takes its markers with it, so nothing is left dangling.
const bold = locatePassage(stored, "barely above a whisper");
assert.equal(stored.slice(bold!.start, bold!.end), "**barely above a whisper**");
const opensInItalics = locatePassage(stored, "She leans in, her voice");
assert.equal(stored.slice(opensInItalics!.start, opensInItalics!.end), "*She leans in,* her voice");
// When taking the markers in would unbalance them, the passage stays as picked.
const half = locatePassage("*one two* three", "two three");
assert.equal("*one two* three".slice(half!.start, half!.end), "two* three");
// Whitespace differences on screen do not matter.
assert.ok(locatePassage(stored, "The   rain\nkeeps on."));
// Text the stored reply does not contain is refused rather than guessed.
assert.equal(locatePassage(stored, "something else entirely"), null);
assert.equal(locatePassage(stored, "   "), null);

// ── Expanding a phrase to its sentence ──
const text = "He waits. A shiver down her spine, cold. Then nothing.";
const phraseAt = text.indexOf("shiver");
const sentence = sentenceAround(text, phraseAt, phraseAt + "shiver down her spine".length);
assert.equal(text.slice(sentence.start, sentence.end), "A shiver down her spine, cold.");
const quoted = 'He said, "Fine. You win." Then left.';
const winAt = quoted.indexOf("You win");
const quotedSentence = sentenceAround(quoted, winAt, winAt + 7);
assert.equal(
  quoted.slice(quotedSentence.start, quotedSentence.end),
  'You win."',
  "a closing quote stays with its sentence",
);

assert.equal(replacePassage("abcdef", 2, 4, "XY"), "abXYef");

// ── The rewrite request ──
assert.ok(isValidFixRange("hello", 0, 5));
assert.ok(!isValidFixRange("hello", 3, 3), "an empty passage is not a passage");
assert.ok(!isValidFixRange("hello", 2, 9), "a passage past the end is refused");
assert.ok(!isValidFixRange("hello", 1.5, 3));

const reply = "She sighs. A shiver down her spine. She turns away.";
const start = reply.indexOf("A shiver");
const end = reply.indexOf(" She turns");
const [system, user] = buildFixPartMessages({
  reply,
  start,
  end,
  instruction: "",
  avoid: ["shiver down her spine", "  ", "ozone"],
  previousTurn: "I reach for her hand.",
  writerName: "Kyli",
});
assert.equal(system!.role, "system");
assert.ok(
  system!.content.includes("Never write dialogue, thoughts or actions for Kyli"),
  "the writer's character is protected",
);
assert.ok(
  system!.content.includes("  - shiver down her spine") && system!.content.includes("  - ozone"),
  "the slop list is passed on",
);
assert.ok(!system!.content.includes("  - \n"), "blank phrases are dropped");
assert.ok(
  user!.content.includes("She sighs. ⟦A shiver down her spine.⟧ She turns away."),
  "only the passage is marked",
);
assert.ok(user!.content.includes("<the_turn_it_answered>\nI reach for her hand."));
assert.ok(user!.content.includes(DEFAULT_FIX_INSTRUCTION), "no instruction means the default one");
const noAvoid = buildFixPartMessages({ reply, start, end, instruction: "Shorter." })[0]!.content;
assert.ok(!noAvoid.includes("overused phrases"), "no list, no avoid section");
const [, spelled] = buildFixPartMessages({
  reply,
  start,
  end,
  instruction: "Show it, don't tell it",
  characters: ["Vee: Guarded, dry, slow to forgive.", "  "],
});
assert.ok(spelled!.content.includes("Replace named emotions"), "a quick ask is spelled out");
assert.ok(spelled!.content.includes("<characters>\nVee: Guarded, dry, slow to forgive.\n</characters>"));
const [, ownWords] = buildFixPartMessages({ reply, start, end, instruction: "Make him angrier." });
assert.ok(ownWords!.content.includes("What to change in the marked passage: Make him angrier."));
assert.ok(!ownWords!.content.includes("<characters>"), "no cards, no characters block");

// ── Cleaning up the model's answer ──
const original = " A shiver down her spine.";
assert.equal(readFixPartReply("Cold settles in her.", original), " Cold settles in her.", "edge spaces are kept");
assert.equal(
  readFixPartReply("```\nCold settles in her.\n```", original),
  " Cold settles in her.",
  "a code fence is removed",
);
assert.equal(
  readFixPartReply("⟦Cold settles in her.⟧", original),
  " Cold settles in her.",
  "echoed markers are removed",
);
assert.equal(
  readFixPartReply('"Cold settles in her."', original),
  " Cold settles in her.",
  "unasked-for quotes are removed",
);
assert.equal(readFixPartReply('"Stay here."', '"Go away."'), '"Stay here."', "speech keeps its quotes");
assert.equal(readFixPartReply("   ", original), "", "an empty answer stays empty");

// ── Bug pass ──
assert.equal(
  findSlopMatches("She couldn't help but grin.", ["couldn’t help but"]).length,
  1,
  "a phrase typed with a curly apostrophe still matches the straight one",
);
const twice = '"No." She shakes her head. *"No."*';
const second = locatePassage(twice, '"No."', passageOccurrence('"No." She shakes her head. "No."', 27, '"No."'));
assert.equal(twice.slice(second!.start, second!.end), '*"No."*', "the copy picked on screen is the one fixed");
assert.equal(locatePassage(twice, '"No."', 5)!.start, 0, "an occurrence past the end falls back to the first");
const longReply = `${"Filler sentence. ".repeat(1200)}The last line.`;
const longStart = longReply.indexOf("The last line.");
const [, longUser] = buildFixPartMessages({ reply: longReply, start: longStart, end: longStart + 14 });
assert.ok(longUser!.content.includes("⟦The last line.⟧"), "a passage near the end of a long reply keeps its markers");

console.log("fork fix part: ok");

// The slop list is checked on the rewrite itself.
import { findAvoidedPhrases } from "../../packages/server/src/services/generation/fork-fix-part.js";
assert.deepEqual(findAvoidedPhrases("He lifted the weight of her cheek.", ["the weight of", "ozone"]), [
  "the weight of",
]);
assert.deepEqual(findAvoidedPhrases("Velvety skin.", ["velvet"]), [], "whole words only");
assert.deepEqual(findAvoidedPhrases("She didn’t flinch", ["didn't flinch"]), ["didn't flinch"]);

// ── The automatic pass ──
const {
  UNDERTOW_SLOP_PHRASES,
  autoFixPassages,
  mergePhrases,
  replacePassages,
  sameTags,
  storyOnly,
  MAX_AUTO_FIX_PASSAGES,
} = await import("../../packages/client/src/lib/fork/slop.js");
const { buildAutoFixMessages, readAutoFixReply, validAutoFixPassages } =
  await import("../../packages/server/src/services/generation/fork-fix-part.js");

// An Undertow reply: notes and ledger around the story, dialogue in colour spans.
const undertow = [
  '<margin_notes colors="CHERRY">\n· Vee: pulls out of her heat and flips her\n</margin_notes>',
  "Vee slid his cock out of her clutching heat with a wet sound. The air hit your skin.",
  '<span style="color:#6CA0DC">"Keep that face in the pillow,"</span> Vee said, lining up with her entrance again. He pushed in slow.',
  "His breath hitched. His jaw tightened against her shoulder.",
  '<story_ledger turn="16">\n## Bonds\n· Vee | Right now: heated, slick with her wet heat\n</story_ledger>',
].join("\n\n");
const phrasesForTest = [
  "her heat",
  "clutching heat",
  "wet heat",
  "her entrance",
  "breath hitched",
  "jaw tightened",
  "color",
];
const passagesFound = autoFixPassages(undertow, phrasesForTest);
const texts = passagesFound.map((passage) => undertow.slice(passage.start, passage.end));
assert.deepEqual(
  texts,
  [
    "Vee slid his cock out of her clutching heat with a wet sound.",
    '"Keep that face in the pillow,"</span> Vee said, lining up with her entrance again.',
    "His breath hitched.",
    "His jaw tightened against her shoulder.",
  ],
  "story sentences only: notes, ledger and tag attributes are never touched, and a span opening is not part of the passage",
);
const twoInOne = autoFixPassages("He smirked, his breath hitched. Then nothing.", ["smirked", "breath hitched"]);
assert.equal(twoInOne.length, 1, "two phrases in one sentence are one passage");
assert.deepEqual(twoInOne[0]!.phrases, ["smirked", "breath hitched"]);
assert.ok(!storyOnly(undertow).includes("margin_notes") && !storyOnly(undertow).includes("color:"));
assert.equal(storyOnly(undertow).length, undertow.length, "blanking keeps every offset");
assert.equal(autoFixPassages("Clean reply.", phrasesForTest).length, 0);
const many = Array.from({ length: 12 }, (_, i) => `Line ${i} had her heat.`).join(" ");
assert.equal(autoFixPassages(many, ["her heat"]).length, MAX_AUTO_FIX_PASSAGES, "one pass is capped");

// A rewrite must keep its tags, in order.
assert.ok(sameTags('"Hi,"</span> he said.', '"Hey,"</span> he said quietly.'));
assert.ok(!sameTags('"Hi,"</span> he said.', '"Hey," he said.'), "a dropped closing tag is refused");
assert.ok(!sameTags("plain", '<span style="color:red">plain</span>'), "an added tag is refused");
assert.equal(
  replacePassages("aa BB cc DD ee", [
    { start: 3, end: 5, replacement: "bbbb" },
    { start: 9, end: 11, replacement: "d" },
  ]),
  "aa bbbb cc d ee",
  "several swaps land on the original offsets",
);

// The request marks and numbers each passage, and leaves the notes and ledger out.
const asked = passagesFound.map((passage) => ({ start: passage.start, end: passage.end, phrases: passage.phrases }));
assert.ok(validAutoFixPassages(undertow, asked));
assert.ok(!validAutoFixPassages(undertow, [asked[1]!, asked[0]!]), "out of order is refused");
assert.ok(!validAutoFixPassages(undertow, []), "nothing to fix is refused");
const [autoSystem, autoUser] = buildAutoFixMessages({
  reply: undertow,
  passages: asked,
  avoid: phrasesForTest,
  writerName: "Kyli",
});
assert.ok(autoUser!.content.includes("⟦1:Vee slid his cock out of her clutching heat with a wet sound.⟧"));
assert.ok(autoUser!.content.includes("⟦3:His breath hitched.⟧"));
assert.ok(autoUser!.content.includes('4: "jaw tightened"'), "each passage names its phrases");
assert.ok(!autoUser!.content.includes("margin_notes") && !autoUser!.content.includes("story_ledger"));
assert.ok(autoSystem!.content.includes("HTML tag") && autoSystem!.content.includes("plain explicit words"));
assert.ok(autoSystem!.content.includes("Never write dialogue, thoughts or actions for Kyli"));
const originalsForRead = asked.map((passage) => undertow.slice(passage.start, passage.end));
assert.deepEqual(
  readAutoFixReply(
    '<fix n="3">He sucked air through his teeth, mouth against her shoulder.</fix>\n<fix n="1">Vee slid his cock out of her pussy with a wet sound.</fix>\n<fix n="2">⟦broken⟧</fix>',
    originalsForRead,
  ),
  [
    "Vee slid his cock out of her pussy with a wet sound.",
    null,
    "He sucked air through his teeth, mouth against her shoulder.",
    null,
  ],
  "answers are read by number; a missing or marker-bearing one keeps the original",
);

// The master list joins a saved list once, keeping the writer's own phrases first.
assert.deepEqual(mergePhrases(["mine", "Her Heat"], ["her heat", "spine"]), ["mine", "Her Heat", "spine"]);
assert.ok(UNDERTOW_SLOP_PHRASES.includes("clutching heat") && UNDERTOW_SLOP_PHRASES.includes("unhurried"));
assert.ok(DEFAULT_SLOP_PHRASES.includes("clutching heat"), "a fresh install starts with the master list");
console.log("fork fix part, automatic pass: ok");
