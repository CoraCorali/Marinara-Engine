/**
 * Fork: a preset's leaked "Task 0 … Task 10" plan is lifted out of the reply, a reply cut short by
 * hidden thinking is recognised, and a blocked reply is named as blocked.
 */
import assert from "node:assert/strict";

const { extractLeadingTaskPlan, detectThinkingCutoff } =
  await import("../../packages/server/src/services/generation/fork-reply-guards.js");
const { describeEmptyModelResponse } =
  await import("../../packages/server/src/services/generation/empty-response-reason.js");

// ── The leaked plan ──
const leaked = [
  "Task 0: Gamestate. Theo is at the sink, she is in the doorway.",
  "Task 1: Neutrality. He wants her to stay; he will not ask.",
  "  - keep it quiet",
  "**Task 10:** Final check. No quips.",
  "",
  'He looks up from the sink. "You came back."',
  "",
  "Neither of them said it.",
].join("\n");
const lifted = extractLeadingTaskPlan(leaked);
assert.ok(lifted, "a reply opening with Task 0 has its plan lifted");
assert.ok(lifted!.plan.startsWith("Task 0") && lifted!.plan.includes("Task 10"));
assert.equal(lifted!.content, 'He looks up from the sink. "You came back."\n\nNeither of them said it.');

assert.equal(extractLeadingTaskPlan('He looks up. "Task 0 is done," he says.'), null, "prose is left alone");
assert.equal(
  extractLeadingTaskPlan("She kept count.\n\nTask 0: nothing.\n\nThe end of the scene came quickly enough."),
  null,
  "a plan in the middle is not the opening",
);
assert.equal(
  extractLeadingTaskPlan("Task 4: halfway.\n\nSome prose that goes on for a while here."),
  null,
  "only a plan that starts at 0 or 1",
);
assert.equal(extractLeadingTaskPlan("Task 0: plan.\nTask 1: more.\n\nOk."), null, "never empties a reply");

// ── Cut short by thinking ──
assert.deepEqual(
  detectThinkingCutoff("length", "Above you, the sky", { completionTokens: 396, completionReasoningTokens: 384 }, 400),
  {
    reasoningTokens: 384,
    completionTokens: 396,
    maxTokens: 400,
  },
);
assert.equal(
  detectThinkingCutoff("stop", "Fine.", { completionTokens: 396, completionReasoningTokens: 384 }, 400),
  null,
);
assert.equal(
  detectThinkingCutoff("length", "A long reply...", { completionTokens: 1000, completionReasoningTokens: 100 }, 1000),
  null,
  "a reply that simply ran long is not blamed on thinking",
);
assert.equal(
  detectThinkingCutoff("length", "", { completionTokens: 400, completionReasoningTokens: 400 }, 400),
  null,
  "empty replies have their own message",
);

// ── Blocked ──
for (const finish of ["content_filter", "SAFETY", "prohibited_content"]) {
  assert.match(describeEmptyModelResponse({ finishReason: finish, hadThinking: false }), /blocked this reply/);
}
assert.doesNotMatch(describeEmptyModelResponse({ finishReason: "stop", hadThinking: false }), /blocked/);

console.log("fork reply guards: ok");
