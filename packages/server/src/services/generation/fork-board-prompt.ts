// Fork feature: send in-scene board pins to the model (see FORK.md).
import type { BoardPin } from "../board/fork-board-pins.js";
import type { LorebookImageEntry } from "./lorebook-image-prompt.js";

const CATEGORY_LABELS: Record<string, string> = {
  wearing: "Currently wearing",
  place: "This place",
  person: "This person",
  thing: "This thing",
  vibe: "The mood",
};

/**
 * Turn in-scene pins into the same shape lorebook reference images use, so both go through one
 * appender and share its image count and size budget. Persona pins come first, since a signature
 * look (hair, jewellery, a ring) holds across every scene the chat pins describe.
 */
export function boardPinsAsImageEntries(pins: readonly BoardPin[]): LorebookImageEntry[] {
  return pins.map((pin) => ({
    id: `fork-board-${pin.id}`,
    name:
      `${CATEGORY_LABELS[pin.category] ?? "Reference"}${pin.scopeType === "persona" ? " (always on)" : ""}` +
      (pin.caption.trim() ? `: ${pin.caption.trim()}` : ""),
    content: "",
    position: 2,
    images: [{ path: pin.imagePath, caption: pin.caption.trim() }],
  }));
}
