// Fork feature: send what the persona is wearing to the model (see FORK.md).
import type { ClosetItem, ClosetSlot } from "../closet/fork-closet-items.js";
import type { LorebookImageEntry } from "./lorebook-image-prompt.js";

const SLOT_LABELS: Record<ClosetSlot, string> = {
  dress: "Wearing",
  top: "Wearing, on top",
  bottom: "Wearing, on the bottom",
  outer: "Wearing over it",
  shoes: "On her feet",
  bag: "Carrying",
  jewellery: "Jewellery",
  extra: "Also wearing",
};

/**
 * The outfit as pictures, in the same shape lorebook reference images use, so these go through one
 * appender and share its image count and size budget.
 */
export function closetItemsAsImageEntries(worn: readonly ClosetItem[]): LorebookImageEntry[] {
  return worn.map((item) => ({
    id: `fork-closet-${item.id}`,
    name: `${SLOT_LABELS[item.slot]}${item.label.trim() ? `: ${item.label.trim()}` : ""}`,
    content: "",
    position: 2,
    images: [{ path: item.imagePath, caption: item.label.trim() }],
  }));
}

/**
 * The outfit as one plain sentence, for the models that read text more reliably than pictures, and
 * for the ones a picture never reaches at all. Empty when she is wearing nothing from the closet,
 * so a persona with no wardrobe costs nothing.
 */
export function wornOutfitLine(worn: readonly ClosetItem[], personaName: string): string {
  const pieces = worn.map((item) => item.label.trim() || item.slot).filter(Boolean);
  if (pieces.length === 0) return "";
  const who = personaName.trim() || "She";
  return `${who} is wearing: ${pieces.join(", ")}.`;
}
