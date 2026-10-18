// ──────────────────────────────────────────────
// Fork: drop a preset's scratch blocks before reading a message as story (see FORK.md)
// ──────────────────────────────────────────────
// Presets like Undertow write notes around the story itself: margin notes before it, a story
// ledger after it, out-of-character answers, plans in think tags, and the older GFX ledger. Those
// are the writer's notes, not the story. Features that read messages as story (chapter recaps, the
// Director) drop them first, so each message's character budget goes to what actually happened.

const SCRATCH_TAGS = /<(margin_notes|story_ledger|authors_note|think|thinking|knows)\b[^>]{0,2000}>[\s\S]*?<\/\1>/gi;
const GFX_BLOCK = /<!--\s{0,8}GFX_START\s{0,8}-->[\s\S]*?<!--\s{0,8}GFX_END\s{0,8}-->/gi;

export function stripStoryScratch(text: string): string {
  return text.replace(SCRATCH_TAGS, " ").replace(GFX_BLOCK, " ");
}
