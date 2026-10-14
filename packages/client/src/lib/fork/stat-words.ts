// ──────────────────────────────────────────────
// Fork: a word for where a stat stands (Option A tracker cards)
// ──────────────────────────────────────────────

/** Localisation key for a 0-100 reading, so a meter says "low" as well as drawing it. */
export function statWordKey(percent: number): string {
  if (percent <= 10) return "ui.trackerPanel.forkStatWord.empty";
  if (percent < 35) return "ui.trackerPanel.forkStatWord.low";
  if (percent < 65) return "ui.trackerPanel.forkStatWord.steady";
  if (percent < 90) return "ui.trackerPanel.forkStatWord.strong";
  return "ui.trackerPanel.forkStatWord.full";
}
