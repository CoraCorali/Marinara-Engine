/**
 * Fork: reading the kind marker Scene Spark puts on a choice, so the choice bar can show a chip
 * instead of a stray emoji.
 */
import assert from "node:assert/strict";

const { parseChoiceLabel } = await import("../../packages/client/src/lib/fork/choice-kind.js");

// ── The two kinds Scene Spark produces ──
const steer = parseChoiceLabel("🎬 Gia calling, he stares");
assert.equal(steer.kind, "direction");
assert.equal(steer.label, "Gia calling, he stares", "the marker does not stay in the headline");

const say = parseChoiceLabel("💬 Done asking, getting up");
assert.equal(say.kind, "action");
assert.equal(say.label, "Done asking, getting up");

// Variation selectors and separators ride along with emoji more often than not.
assert.equal(parseChoiceLabel("🎥️ : On the porch").label, "On the porch");
assert.equal(parseChoiceLabel("🗣️ — Say it plainly").kind, "action");
assert.equal(parseChoiceLabel("🗣️ — Say it plainly").label, "Say it plainly");

// ── Every other choice agent is left alone ──
const plain = parseChoiceLabel("Head for the truck");
assert.equal(plain.kind, "plain");
assert.equal(plain.label, "Head for the truck");

// An emoji that is not a kind marker is part of the label, not a chip.
assert.equal(parseChoiceLabel("🔥 Burn it down").kind, "plain");
assert.equal(parseChoiceLabel("🔥 Burn it down").label, "🔥 Burn it down");

// ── Nothing is lost ──
assert.equal(parseChoiceLabel("  spaced out  ").label, "spaced out");
assert.equal(parseChoiceLabel("🎬").label, "🎬", "a marker with no words keeps something to show");
assert.equal(parseChoiceLabel("").label, "");

console.log("fork choice kind: ok");
