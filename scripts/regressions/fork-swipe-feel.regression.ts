/**
 * Fork: the newest reply follows a swiping thumb. The feel uses Marinara's own swipe rules, so what
 * the counter promises is what the swipe does; a long-pressed word grows to its sentence.
 */
import assert from "node:assert/strict";

const { isSidewaysDrag, isCommittedSwipe, swipeOutcome, followOffset } =
  await import("../../packages/client/src/lib/fork/swipe-feel.js");
const { isSingleWordSelection } = await import("../../packages/client/src/lib/fork/sentence-range.js");
const { sentenceAround } = await import("../../packages/client/src/lib/fork/slop.js");

assert.equal(isSidewaysDrag(40, 10), true);
assert.equal(isSidewaysDrag(30, 40), false, "scrolling never reads as a swipe");
assert.equal(isSidewaysDrag(6, 0), false, "a wobble is not a drag");
assert.equal(isCommittedSwipe(-70, 10), true);
assert.equal(isCommittedSwipe(-50, 0), false, "short of Marinara's 56px");
assert.equal(isCommittedSwipe(-90, 60), false, "too far up or down");

assert.deepEqual(swipeOutcome(-80, 0, 3, false), { kind: "next", index: 1 }, "left is the next swipe");
assert.deepEqual(swipeOutcome(80, 2, 3, false), { kind: "previous", index: 1 }, "right is the previous one");
assert.deepEqual(swipeOutcome(80, 0, 3, false), { kind: "none" }, "nothing before the first");
assert.deepEqual(swipeOutcome(-80, 2, 3, true), { kind: "new" }, "past the end writes a new one");
assert.deepEqual(swipeOutcome(-80, 2, 3, false), { kind: "none" }, "unless reroll at the end is off");
assert.deepEqual(swipeOutcome(-80, 0, 0, true), { kind: "new" }, "a reply with no swipes yet counts as one");

assert.equal(followOffset(30), 10.5);
assert.equal(followOffset(-1000), -90, "never slides past 90px");

assert.equal(isSingleWordSelection(" sighed "), true);
assert.equal(isSingleWordSelection("he sighed"), false, "a wider pick is left alone");
assert.equal(isSingleWordSelection("  "), false);
const text = 'The rain came down. Theo sighed, "Keep it." She laughed.';
const at = text.indexOf("sighed");
const bounds = sentenceAround(text, at, at + 6);
assert.equal(text.slice(bounds.start, bounds.end), 'Theo sighed, "Keep it."');
console.log("fork swipe feel: ok");
