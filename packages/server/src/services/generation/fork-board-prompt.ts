// Fork feature: send board pins to the model (see FORK.md).
import {
  FORK_PIN_WHO_PERSONA,
  FORK_PIN_WHO_SCENE,
  forkWearSlotsReplacedBy,
  type ForkWearSlot,
} from "@marinara-engine/shared";
import type { BoardPin } from "../board/fork-board-pins.js";
import type { LorebookImageEntry } from "./lorebook-image-prompt.js";

const CATEGORY_LABELS: Record<string, string> = {
  wearing: "Wearing",
  place: "Place",
  person: "Person",
  thing: "Thing",
  vibe: "The mood",
};

const SLOT_LABELS: Record<ForkWearSlot, string> = {
  outfit: "Full outfit",
  top: "Top",
  bottom: "Bottom",
  dress: "Dress",
  outerwear: "Outerwear",
  shoes: "Shoes",
  bag: "Bag",
  jewelry: "Jewelry",
  hair: "Hair",
  makeup: "Makeup",
  nails: "Nails",
};

/** Who a pin is about, by name, or "" when it is about the scene or nobody said. */
export type PinNameFor = (who: string) => string;

/** "Kyli is wearing (Dress): yellow halter maxi dress", "Place: the bakery", and so on. */
function describePin(pin: BoardPin, nameFor: PinNameFor): string {
  const caption = pin.caption.trim();
  const name = pin.who && pin.who !== FORK_PIN_WHO_SCENE ? nameFor(pin.who) : "";
  let label: string;
  if (pin.category === "wearing") {
    const slot = pin.slot ? SLOT_LABELS[pin.slot] : "";
    const styling = pin.slot === "hair" || pin.slot === "makeup" || pin.slot === "nails";
    if (!name) label = `Wearing${slot ? ` (${slot})` : ""}`;
    else if (styling) label = `${name}'s ${slot.toLowerCase()}`;
    else label = `${name} is wearing${slot ? ` (${slot})` : ""}`;
    if (pin.shows === "clothes") label += ", just the clothes, no one wearing them";
  } else {
    label = name
      ? `${CATEGORY_LABELS[pin.category] ?? "Reference"}, ${name}`
      : (CATEGORY_LABELS[pin.category] ?? "Reference");
  }
  if (pin.scopeType === "persona") label += " (always on)";
  return caption ? `${label}: ${caption}` : label;
}

/**
 * How to read the pictures. A picture shows clothes, hair, places and things, never a body: the
 * person modelling a dress is not the character, so the dress is written on the character's own
 * body from their card, and a hair pin changes the hair and nothing else about them.
 */
const HOW_TO_READ = [
  "How to use these pictures:",
  "- They show clothes, styling, places and things. Anyone modelling the clothes is not the character: keep each person's body, build, height, skin, face and features exactly as their persona or character card describes, and write the clothes as they fit and look on that person's own body.",
  "- A Hair, Makeup or Nails pin replaces that person's hair, makeup or nails for now; nothing else about the photo carries over.",
  "- A piece worn with a full outfit (shoes, a top, a bag) replaces the outfit's matching part.",
].join("\n");

/**
 * Turn pins into the same shape lorebook reference images use, so both go through one appender and
 * share its image count and size budget. Persona pins come first, since a signature look holds
 * across every scene.
 */
export function boardPinsAsImageEntries(
  pins: readonly BoardPin[],
  nameFor: PinNameFor = () => "",
  mentioned: ReadonlySet<string> = new Set(),
): LorebookImageEntry[] {
  return pins.map((pin) => ({
    id: `fork-board-${pin.id}`,
    name: describePin(pin, nameFor),
    heading: mentioned.has(pin.id)
      ? `Reference picture, mentioned in the latest message — ${describePin(pin, nameFor)}`
      : `Reference picture — ${describePin(pin, nameFor)}`,
    content: "",
    position: 2,
    images: [{ path: pin.imagePath, caption: pin.caption.trim() }],
  }));
}

/**
 * The pins as words, for models that read text more reliably than pictures and for providers a
 * picture never reaches, with the rules for reading them.
 */
export function boardPinsNoteLine(
  pins: readonly BoardPin[],
  nameFor: PinNameFor = () => "",
  mentioned: ReadonlySet<string> = new Set(),
): string {
  // A pin with no caption has nothing to say in words; its picture still goes.
  const worded = pins.filter((pin) => pin.caption.trim());
  if (worded.length === 0) return "";
  const lines = worded.map(
    (pin) => `- ${describePin(pin, nameFor)}${mentioned.has(pin.id) ? " (mentioned in the latest message)" : ""}`,
  );
  return [
    "Pinned for reference in this scene (pictures attached where the model can see them):",
    ...lines,
    HOW_TO_READ,
  ].join("\n");
}

/** The persona is "persona" on a pin; everyone else is their character id. */
export function pinNameResolver(personaName: string, characterName: (id: string) => string): PinNameFor {
  return (who) => (who === FORK_PIN_WHO_PERSONA ? personaName : characterName(who));
}

/**
 * The pins one reply carries: the scene's, plus any the latest message mentions. A mentioned piece
 * stands in for what it replaces ("in the navy shirt" over the pinned pink set), for this reply
 * only, so the model is never told two outfits at once. The board itself is left as it is.
 */
export function pinsForReply(inScene: readonly BoardPin[], mentioned: readonly BoardPin[]): BoardPin[] {
  const replacedBy = (pin: BoardPin) =>
    mentioned.some(
      (mention) =>
        mention.category === "wearing" &&
        pin.category === "wearing" &&
        mention.who &&
        mention.who === pin.who &&
        forkWearSlotsReplacedBy(mention.slot).includes(pin.slot as ForkWearSlot),
    );
  return [...inScene.filter((pin) => !replacedBy(pin)), ...mentioned];
}
