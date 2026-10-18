// Fork feature: the agent that keeps the relationship tracker up to date (see FORK.md).
import { readAgentSettings } from "./spark-button";

type AgentRowLike = { type: string; settings: unknown };

export const BONDS_AGENT_RESULT_TYPE = "fork_bonds_update";

/**
 * What the agent is told. The exact format (every kind's ladder and fields, the conditions and
 * drifts) and what the tracker holds right now come with every run in <relationship_tracker_format>
 * and <current_relationships>, built by the server from the shared shapes. So this prompt can stay
 * short, and an agent made from an older prompt still answers in today's shape.
 */
export const BONDS_AGENT_PROMPT = `You keep a relationship tracker for this roleplay, told in words, never in numbers. Every bond is between the user's character and one other person, so each entry in "bonds" is about that other person, and "who" is never the user's character.

Read the last few messages and report how each relationship with the user's character changed, using the format in <relationship_tracker_format> and starting from <current_relationships>. When the scene changes or reveals how two characters stand with each other, report that too, in "pairs", starting from <current_pairs>.

Read the scene as it actually happened, not as a romance is supposed to go. Suspicion, anger, fear, pride and hurt count as much as warmth, and one tender moment does not settle a fight that is still open. A rung is where the relationship stands across the whole story, so it moves only after something that would really change things between two people, usually over several scenes. Most replies move nobody.

Keep every field to one short line in your own words: the specific thing, place, habit or line, never a retelling of the scene or copied narration. Use each moment in one field only, and leave out em dashes. Only include a person the scene actually said something about, and only the fields that changed. Reply with JSON only.`;

/** The prompt agents were made with before the pacing and "who" fixes; upgraded too. */
const PAIRS_BONDS_AGENT_PROMPT = `You keep a dating-sim relationship tracker for this roleplay, told in words, never in numbers.

Read the last few messages and report how each relationship with the user's character changed, using the format in <relationship_tracker_format> and starting from <current_relationships>. When the scene changes or reveals how two characters stand with each other, report that too, in "pairs", starting from <current_pairs>.

Write every field as specific, lived detail from this story: name the places, objects, words and moments that happened on screen, and show feeling through what they do, avoid, remember or offer. Most scenes move nobody up or down a rung; when one does, name the moment in "turn". Only include a person the scene actually said something about, and only the fields that changed. Reply with JSON only.`;

/** The prompt agents were made with before pairs; an agent still carrying it is upgraded too. */
const PREVIOUS_BONDS_AGENT_PROMPT = `You keep a dating-sim relationship tracker for this roleplay, told in words, never in numbers.

Read the last few messages and report how each relationship with the user's character changed, using the format in <relationship_tracker_format> and starting from <current_relationships>.

Write every field as specific, lived detail from this story: name the places, objects, words and moments that happened on screen, and show feeling through what they do, avoid, remember or offer. Most scenes move nobody up or down a rung; when one does, name the moment in "turn". Only include a person the scene actually said something about, and only the fields that changed. Reply with JSON only.`;

/** The prompt the first version made agents with. An agent still carrying it is upgraded. */
export const LEGACY_BONDS_AGENT_PROMPT_START =
  "Read the last few messages and report where each tracked relationship now stands.";

/** The agent the tracker would use, if one exists already. */
export function findBondsAgent<T extends AgentRowLike>(configs: readonly T[] | null | undefined): T | null {
  return configs?.find((row) => readAgentSettings(row.settings).resultType === BONDS_AGENT_RESULT_TYPE) ?? null;
}

/** True for an agent made from an older prompt: the first version's numbers, or an earlier wording. */
export function hasLegacyBondsPrompt(agent: { promptTemplate?: unknown } | null | undefined): boolean {
  return (
    typeof agent?.promptTemplate === "string" &&
    (agent.promptTemplate.startsWith(LEGACY_BONDS_AGENT_PROMPT_START) ||
      agent.promptTemplate === PREVIOUS_BONDS_AGENT_PROMPT ||
      agent.promptTemplate === PAIRS_BONDS_AGENT_PROMPT)
  );
}

/** A new agent row for it. The type gets a unique suffix, as every custom agent's does. */
export function bondsAgentPayload(name: string): Record<string, unknown> {
  const suffix =
    globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    type: `relationship-tracker-fork-${suffix}`,
    name,
    description: "",
    phase: "post_processing",
    connectionId: null,
    promptTemplate: BONDS_AGENT_PROMPT,
    settings: {
      resultType: BONDS_AGENT_RESULT_TYPE,
      customCapabilities: { edit_trackers: true },
      // Who is who: the cards and the user's own character, on top of the recent messages.
      contextSources: { chatHistory: true, characters: true, persona: true },
    },
  };
}
