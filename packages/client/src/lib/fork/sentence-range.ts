// ──────────────────────────────────────────────
// Fork: a long-pressed word grows to its sentence (see FORK.md)
// ──────────────────────────────────────────────

/** A long press picks one word: no spaces in it. Anything wider was chosen on purpose. */
export function isSingleWordSelection(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed);
}
