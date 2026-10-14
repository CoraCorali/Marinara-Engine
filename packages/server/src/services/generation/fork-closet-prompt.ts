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

/** Slot-specific wording, so "a red one" still produces the right kind of garment. */
const SLOT_SUBJECTS: Record<ClosetSlot, string> = {
  dress: "a single dress",
  top: "a single top",
  bottom: "a single pair of trousers, skirt or shorts",
  outer: "a single jacket or coat",
  shoes: "a single pair of shoes",
  bag: "a single bag",
  jewellery: "a single piece of jewellery",
  extra: "a single clothing item",
};

/**
 * What to ask the image model for. The reference picture carries the drawing style, so the words
 * carry the garment and the framing: one item, laid flat, nobody wearing it, on plain white, with
 * room around it. That last part matters more than it looks — a piece drawn touching its
 * neighbours cannot be cut out cleanly afterwards.
 */
export function buildGarmentPrompt(slot: ClosetSlot, description: string): string {
  const wanted = description.trim();
  return [
    `${SLOT_SUBJECTS[slot]}: ${wanted || "a simple everyday piece"}.`,
    "Drawn in exactly the same illustration style, line weight and colouring as the reference image.",
    "The garment only, laid flat, with nobody wearing it and no body parts visible.",
    "Centred on a plain white background with clear empty space around every edge.",
    "No text, no labels, no watermark, no second item.",
  ].join(" ");
}
