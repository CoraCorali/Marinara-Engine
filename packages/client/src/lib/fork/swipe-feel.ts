// ──────────────────────────────────────────────
// Fork: what a sideways drag on the chat means for the newest reply (see FORK.md)
// ──────────────────────────────────────────────
// Marinara's own "Intuitive swipe navigation" does the swiping (ChatArea). These are the same rules,
// so the reply that follows the thumb and the counter above it always agree with what will happen.

/** Marinara's thresholds: at least this far sideways, and not too far up or down. */
export const SWIPE_MIN_DISTANCE = 56;
export const SWIPE_MAX_VERTICAL_DRIFT = 44;

export type SwipeOutcome = { kind: "previous" | "next"; index: number } | { kind: "new" } | { kind: "none" };

/** Whether a drag reads as a sideways swipe yet (it is mostly horizontal). */
export function isSidewaysDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy) * 1.35;
}

/** Whether the drag, if let go now, is a swipe (the same test as Marinara's touchend). */
export function isCommittedSwipe(dx: number, dy: number): boolean {
  return (
    Math.abs(dx) >= SWIPE_MIN_DISTANCE &&
    Math.abs(dy) <= SWIPE_MAX_VERTICAL_DRIFT &&
    Math.abs(dx) >= Math.abs(dy) * 1.35
  );
}

/**
 * What a swipe this way does. Left (dx < 0) is the next swipe, or a new one at the end when "reroll
 * at the end" is on; right is the previous one.
 */
export function swipeOutcome(dx: number, active: number, count: number, rerollAtEnd: boolean): SwipeOutcome {
  const total = Math.max(1, count);
  if (dx > 0) return active > 0 ? { kind: "previous", index: active - 1 } : { kind: "none" };
  if (active < total - 1) return { kind: "next", index: active + 1 };
  return rerollAtEnd ? { kind: "new" } : { kind: "none" };
}

/** How far the reply follows the thumb: a third of the drag, never past 90px. */
export function followOffset(dx: number): number {
  return Math.max(-90, Math.min(90, dx * 0.35));
}
