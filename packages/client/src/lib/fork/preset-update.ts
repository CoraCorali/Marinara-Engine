// Fork feature: update a preset in place (see FORK.md).

type PresetLike = { id: string; name: string };

/** Names match when they read the same to a person: case and surrounding spaces do not count. */
function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

/**
 * The preset an imported file would update: an existing preset with the same name.
 * Returns null when there is none, or when several share that name, since then there is no
 * single obvious target and adding a copy is the safe answer.
 */
export function findPresetToUpdate(
  envelope: unknown,
  presets: readonly PresetLike[] | null | undefined,
): PresetLike | null {
  if (!presets?.length) return null;
  const data = (envelope as { data?: { preset?: { name?: unknown } } } | null)?.data;
  const incomingName = typeof data?.preset?.name === "string" ? data.preset.name : "";
  if (!incomingName.trim()) return null;
  const matches = presets.filter((preset) => sameName(preset.name, incomingName));
  return matches.length === 1 ? matches[0]! : null;
}
