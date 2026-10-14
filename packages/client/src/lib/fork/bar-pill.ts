// ──────────────────────────────────────────────
// Fork: the pill buttons in the row above the message box
// ──────────────────────────────────────────────

/**
 * Shared by the fork's own buttons and Marinara's roleplay actions, so the row reads as one.
 *
 * Compact: 34px tall with 12px icons, so more pills fit across a phone. The fill is the card colour
 * laid over the page background, so it is solid even when a theme's card colour is see-through and
 * the chat scrolling under the row never shows through the pills. Icon size is marked important
 * because a theme's unlayered CSS otherwise wins over these utilities.
 */
export const FORK_BAR_PILL_CLASS =
  "flex min-h-[2.125rem] shrink-0 items-center gap-1 rounded-full border border-[var(--marinara-chat-chrome-panel-border)] [background:linear-gradient(var(--card),var(--card)),var(--background)] px-2.5 text-[0.75rem] font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-all disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-3! [&_svg]:w-3! [&_svg]:shrink-0 [&_svg]:text-[var(--primary)]";

export const FORK_BAR_PILL_IDLE_CLASS = "text-foreground/85 hover:bg-foreground/10 hover:text-foreground";
