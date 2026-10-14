// Fork feature: Spark button (see FORK.md).

type AgentRowLike = { type: string; settings: unknown };

/** An agent row's settings, whether stored as an object or as a JSON string. */
export function readAgentSettings(settings: unknown): Record<string, unknown> {
  if (settings && typeof settings === "object") return settings as Record<string, unknown>;
  if (typeof settings === "string" && settings.trim()) {
    try {
      const parsed = JSON.parse(settings);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * The agent the Spark button runs: the first active custom agent whose result type is
 * Interactive Choices. The official CYOA agent is skipped, since it already runs every turn.
 */
export function findSparkAgentType(
  activeAgentIds: readonly string[],
  configs: readonly AgentRowLike[] | null | undefined,
): string | null {
  if (!configs?.length) return null;
  for (const id of activeAgentIds) {
    if (id === "cyoa") continue;
    const row = configs.find((config) => config.type === id);
    if (row && readAgentSettings(row.settings).resultType === "cyoa_choices") return id;
  }
  return null;
}
