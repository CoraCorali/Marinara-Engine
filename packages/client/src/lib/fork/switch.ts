// ──────────────────────────────────────────────
// Fork: an on/off switch in the theme's colours
// ──────────────────────────────────────────────

/**
 * For an `<input type="checkbox" role="switch">`: still a real checkbox (labels, keyboard and screen
 * readers just work), drawn as a pill whose knob slides over when it is on. A plain checkbox showed
 * as the browser's grey square, the one control in the fork's panels that ignored the theme.
 */
export const FORK_SWITCH_CLASS =
  "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-[var(--border)] bg-foreground/15 transition-colors before:absolute before:left-0.5 before:top-1/2 before:h-[1.125rem] before:w-[1.125rem] before:-translate-y-1/2 before:rounded-full before:bg-foreground/80 before:shadow before:transition-transform checked:border-[var(--primary)] checked:bg-[var(--primary)] checked:before:translate-x-5 checked:before:bg-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none motion-reduce:before:transition-none";
