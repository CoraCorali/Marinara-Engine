// ──────────────────────────────────────────────
// Fork: a person's pinned clothes as the tracker's "Wearing" line (see FORK.md)
// ──────────────────────────────────────────────
import { FORK_WEAR_SLOTS, forkMessageMentionsPin } from "@marinara-engine/shared";
import type { BoardPin } from "../../hooks/use-fork-board";

/** A character's in-scene wearing pins, in slot order, as the tracker's one "Wearing" line. */
export function outfitLineFromPins(pins: readonly BoardPin[]): string {
  return [...pins]
    .sort(
      (left, right) => FORK_WEAR_SLOTS.indexOf(left.slot || "outfit") - FORK_WEAR_SLOTS.indexOf(right.slot || "outfit"),
    )
    .map((pin) => pin.caption.trim())
    .filter(Boolean)
    .join("; ");
}

/** Whether the tracker's line still describes the pinned clothes (shares a two-word phrase). */
export function outfitStillMatches(trackerLine: string, pins: readonly BoardPin[]): boolean {
  return pins.some(
    (pin) => forkMessageMentionsPin(trackerLine, pin.caption) || forkMessageMentionsPin(pin.caption, trackerLine),
  );
}
