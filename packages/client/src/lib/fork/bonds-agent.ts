// Fork feature: the agent that keeps the relationship tracker up to date (see FORK.md).
import { readAgentSettings } from "./spark-button";

type AgentRowLike = { type: string; settings: unknown };

export const BONDS_AGENT_RESULT_TYPE = "fork_bonds_update";

/**
 * What the agent is told. It is shown what the tracker holds right now in a
 * <current_relationships> block, so it reports a change from there rather than guessing fresh
 * numbers, and the server still caps how far one reply may move anything.
 */
export const BONDS_AGENT_PROMPT = `Read the last few messages and report where each tracked relationship now stands.

Reply with JSON only: {"bonds":[{"who":"","kind":"","stage":"","first":0,"second":0,"note":""}]}

- "who" is the person's name exactly as the tracker or the chat writes it.
- "kind" is one of love, family, friend, rival, ex, other.
- "stage" applies only to love and is one of talking, dating, together, living, engaged, married.
- "first" and "second" are 0-100 for that kind's two meters: love is wanting and patience, family is closeness and friction, friend is closeness and trust, rival is respect and hostility, ex is unfinished business and bitterness, other is closeness and trust.
- "note" is one short line on where it stands now.

Start from the values in <current_relationships> and move them only as far as the scene justifies; most replies move a meter a little or not at all. Only include a relationship the scene actually said something about, and leave out any field you are not sure changed.`;

/** The agent the tracker would use, if one exists already. */
export function findBondsAgent<T extends AgentRowLike>(configs: readonly T[] | null | undefined): T | null {
  return configs?.find((row) => readAgentSettings(row.settings).resultType === BONDS_AGENT_RESULT_TYPE) ?? null;
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
