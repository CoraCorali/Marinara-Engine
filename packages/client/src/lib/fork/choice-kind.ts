// Fork feature: tell the two kinds of Spark choice apart (see FORK.md).

export type ChoiceKind = "direction" | "action" | "plain";

/** What the agent puts in front of a label to say which kind of choice it is. */
const DIRECTION_MARKERS = ["🎬", "🎥", "📽️", "🎞️"];
const ACTION_MARKERS = ["💬", "🗣️", "💭"];

export interface ParsedChoiceLabel {
  kind: ChoiceKind;
  /** The label with the marker taken off, so the headline reads as a headline. */
  label: string;
}

/**
 * Scene Spark marks a choice that steers the world differently from one the persona says out
 * loud, and it does it with an emoji at the front of the label. Reading that marker here means the
 * choice bar can show a proper chip instead of a stray glyph, and a label without a marker is
 * simply left alone — which is what every other choice agent produces.
 */
export function parseChoiceLabel(label: string): ParsedChoiceLabel {
  const trimmed = label.trim();
  for (const marker of DIRECTION_MARKERS) {
    if (trimmed.startsWith(marker)) return { kind: "direction", label: stripMarker(trimmed, marker) };
  }
  for (const marker of ACTION_MARKERS) {
    if (trimmed.startsWith(marker)) return { kind: "action", label: stripMarker(trimmed, marker) };
  }
  return { kind: "plain", label: trimmed };
}

function stripMarker(label: string, marker: string): string {
  // Variation selectors and a separator often ride along with the emoji.
  return (
    label
      .slice(marker.length)
      .replace(/^[️\s:·—-]+/, "")
      .trim() || label
  );
}
