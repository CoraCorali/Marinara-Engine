// Fork feature: two things that go wrong with Gemini through LinkAPI, caught at the source (see FORK.md).
import type { LLMUsage } from "../llm/base-provider.js";

/** A line that opens a planning step: "Task 0:", "**Task 3 —", "### Task 10." */
const TASK_LINE = /^[\s>*_#-]*task\s*(\d{1,2})\b/i;

/**
 * Some presets ask the model to work through "Task 0" to "Task 10" in its built-in thinking, and
 * then write the reply. Gemini sometimes writes the plan into the reply instead. When a reply opens
 * with that plan, the plan is lifted out so it can go to the thinking box, and the reply starts
 * where the prose does.
 *
 * Deliberately narrow: the reply must open with Task 0 (or Task 1) in its first few lines, and the
 * plan ends at the first blank line after its last task heading. If nothing would be left of the
 * reply, nothing is lifted, so a reply that is only a plan is never emptied.
 */
export function extractLeadingTaskPlan(text: string): { plan: string; content: string } | null {
  const lines = text.split("\n");
  const firstReal = lines.findIndex((line) => line.trim().length > 0);
  if (firstReal < 0 || firstReal > 3) return null;
  const opening = TASK_LINE.exec(lines[firstReal]!);
  if (!opening || Number(opening[1]) > 1) return null;

  let lastTask = firstReal;
  for (let index = firstReal + 1; index < lines.length; index += 1) {
    if (TASK_LINE.test(lines[index]!)) lastTask = index;
  }
  let end = lines.length;
  for (let index = lastTask + 1; index < lines.length; index += 1) {
    if (!lines[index]!.trim()) {
      end = index;
      break;
    }
  }
  const content = lines.slice(end).join("\n").trim();
  if (content.length < 20) return null;
  return { plan: lines.slice(firstReal, end).join("\n").trim(), content };
}

export type ThinkingCutoff = { reasoningTokens: number; completionTokens: number; maxTokens: number | null };

/**
 * A reply that was cut off because hidden thinking used most of the output budget.
 *
 * Through LinkAPI, Gemini's thinking counts against max tokens and cannot be turned down short of
 * switching it off, so a modest budget gets mostly spent thinking and the reply stops mid-sentence.
 * Marinara already explains a reply that came back empty; this is the one that came back short.
 */
export function detectThinkingCutoff(
  finishReason: string | null | undefined,
  visibleText: string,
  usage: Pick<LLMUsage, "completionTokens" | "completionReasoningTokens"> | null | undefined,
  maxTokens: number | null | undefined,
): ThinkingCutoff | null {
  if ((finishReason ?? "").toLowerCase() !== "length" || !visibleText.trim()) return null;
  const reasoning = usage?.completionReasoningTokens;
  const completion = usage?.completionTokens;
  if (typeof reasoning !== "number" || typeof completion !== "number" || completion <= 0) return null;
  if (reasoning < completion * 0.4) return null;
  return {
    reasoningTokens: reasoning,
    completionTokens: completion,
    maxTokens: typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : null,
  };
}
