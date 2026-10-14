// Fork feature: update a preset in place (see FORK.md).

type PresetLike = { id: string; name: string };

/**
 * A name with its version number taken out, so "FF 5.4.8 — Jules Custom" and
 * "FF 5.4.9 — Jules Custom" read as the same preset. Punctuation and spacing are flattened too,
 * since an em dash swapped for a hyphen is not a different preset. A bare number is left alone,
 * so "Preset 2" and "Preset 3" stay apart.
 */
function presetNameKey(name: string): string {
  return name
    .toLocaleLowerCase()
    .replace(/\bv?\d+(?:\.\d+)+\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * The preset an imported file would update.
 *
 * A file exported from this app carries the id of the preset it came from, so re-importing it
 * updates that preset however it has been renamed since. Otherwise the name decides, ignoring the
 * version number in it, because an updated preset almost always arrives under a bumped version.
 *
 * Returns null when nothing matches, or when several presets match, since then there is no single
 * obvious target and adding a copy is the safe answer.
 */
export function findPresetToUpdate(
  envelope: unknown,
  presets: readonly PresetLike[] | null | undefined,
): PresetLike | null {
  if (!presets?.length) return null;
  const incoming = (envelope as { data?: { preset?: { id?: unknown; name?: unknown } } } | null)?.data?.preset;

  const incomingId = typeof incoming?.id === "string" ? incoming.id.trim() : "";
  if (incomingId) {
    const samePreset = presets.find((preset) => preset.id === incomingId);
    if (samePreset) return samePreset;
  }

  const incomingName = typeof incoming?.name === "string" ? incoming.name : "";
  const key = presetNameKey(incomingName);
  if (!key) return null;
  const matches = presets.filter((preset) => presetNameKey(preset.name) === key);
  return matches.length === 1 ? matches[0]! : null;
}
