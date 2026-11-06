// Fork feature: the Director's chair (see FORK.md).

/**
 * `/guided` reads a direction that opens with "as", "for" or "from" (or "respond as", "reply for"…)
 * as a request to make one character answer, and with no character of that name it only shows its
 * help. A note like "As the storm hits, she runs" would then never reach the story.
 */
const READS_AS_TARGET = /^(?:(?:respond|reply|answer)\s+)?(?:for|as|from)\s+/iu;

/** The composer text that carries a Director note into the next reply as a guided direction. */
export function guidedCommandForNote(note: string): string {
  const direction = note.trim();
  return READS_AS_TARGET.test(direction) ? `/guided Next: ${direction}` : `/guided ${direction}`;
}
