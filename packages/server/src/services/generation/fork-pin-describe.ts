// Fork feature: "Describe it" on a board pin (see FORK.md).
//
// The model looks at the picture and writes the caption a person would type, so a multi-piece
// outfit gets words like "white fluffy boots" that a message can mention, and suggests what kind
// of pin it is. Nothing is saved here: the board shows the suggestion and the user keeps it.
import {
  BOARD_PIN_CATEGORIES_SHARED,
  FORK_WEAR_SLOTS,
  normalizeForkPinShows,
  normalizeForkWearSlot,
  type ForkPinShows,
  type ForkWearSlot,
} from "@marinara-engine/shared";

export type PinDescription = {
  caption: string;
  category: (typeof BOARD_PIN_CATEGORIES_SHARED)[number];
  slot: ForkWearSlot | "";
  shows: ForkPinShows;
};

export const PIN_DESCRIBE_PROMPT = [
  "You label reference pictures for a roleplay's mood board.",
  "Look at the picture and return only valid JSON in this exact shape, with nothing before or after it:",
  '{"caption": "...", "category": "...", "slot": "...", "shows": "..."}',
  "",
  `- category: one of ${BOARD_PIN_CATEGORIES_SHARED.join(", ")}. Clothes, shoes, bags, jewelry, hair, makeup and nails are "wearing".`,
  `- slot (wearing only, else ""): one of ${FORK_WEAR_SLOTS.join(", ")}. Several garments together (on a person or laid out) are "outfit"; a close-up of a hairstyle is "hair".`,
  '- shows (wearing only): "model" if someone is wearing it, "clothes" if it is laid out with no one in it.',
  "- caption: the visible items in plain, everyday words a person would type, with colour and material, separated by commas, at most 18 words. For example: pink zip hoodie, cream top, grey leggings, white fluffy boots, white shoulder bag.",
  "- Describe only what is worn, held or shown. Never describe the person's body, face, skin or build. Ignore watermarks, logos and brand names.",
].join("\n");

/** Read the model's answer, keeping only what fits the board. Null when nothing usable came back. */
export function readPinDescription(raw: string): PinDescription | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const caption = typeof parsed.caption === "string" ? parsed.caption.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (!caption) return null;
  const category = BOARD_PIN_CATEGORIES_SHARED.includes(parsed.category as never)
    ? (parsed.category as PinDescription["category"])
    : "wearing";
  return {
    caption,
    category,
    slot: category === "wearing" ? normalizeForkWearSlot(parsed.slot) : "",
    shows: normalizeForkPinShows(parsed.shows),
  };
}
