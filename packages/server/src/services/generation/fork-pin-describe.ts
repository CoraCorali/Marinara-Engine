// Fork feature: "Describe it" on a board pin (see FORK.md).
//
// The model looks at the picture and writes the caption a person would type, so a multi-piece
// outfit gets words like "white fluffy boots" that a message can mention, and suggests what kind
// of pin it is. Nothing is saved here: the board shows the suggestion and the user keeps it.
import {
  BOARD_PIN_CATEGORIES_SHARED,
  FORK_WEAR_SLOTS,
  normalizeForkPinDetails,
  normalizeForkPinName,
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
  /** A place's, thing's or person's short name; "" when the picture does not give one. */
  name: string;
  /** A vibe's colours and mood words. */
  palette: string[];
  words: string[];
};

export const PIN_DESCRIBE_PROMPT = [
  "You label reference pictures for a roleplay's mood board.",
  "Look at the picture and return only valid JSON in this exact shape, with nothing before or after it:",
  '{"caption": "...", "category": "...", "slot": "...", "shows": "...", "name": "...", "palette": [], "words": []}',
  "",
  `- category: one of ${BOARD_PIN_CATEGORIES_SHARED.join(", ")}. Clothes, shoes, bags, jewelry, hair, makeup and nails are "wearing".`,
  `- slot (wearing only, else ""): one of ${FORK_WEAR_SLOTS.join(", ")}. Several garments together (on a person or laid out) are "outfit"; a close-up of a hairstyle is "hair".`,
  '- shows (wearing only): "model" if someone is wearing it, "clothes" if it is laid out with no one in it.',
  "- caption: the visible items in plain, everyday words a person would type, with colour and material, separated by commas, at most 18 words. For example: pink zip hoodie, cream top, grey leggings, white fluffy boots, white shoulder bag.",
  "- When the picture is a close-up of hair, makeup or nails, the caption is only about that one thing (for example: blonde spiral curls in a high updo), not the clothes or jewelry also in the shot.",
  "- A place: the caption is its layout, light and mood (for example: narrow kitchen, warm pendant lights, flour on the counter, rain on the window). name is what someone would call it (for example: the bakery kitchen).",
  "- A thing: the caption is its material, size, colour and condition (for example: navy umbrella, one bent spoke, wooden handle). name is a short name for it (for example: navy umbrella).",
  '- A person: the caption is their hair, style and expression, never their body. name is "" unless the picture shows a name.',
  "- A vibe (a mood or aesthetic rather than one thing): the caption is the feeling in a few words; palette is up to 5 colours from the picture as #rrggbb; words is up to 5 mood words.",
  '- Leave name "" for wearing, and palette and words empty for anything but a vibe.',
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
  const details = normalizeForkPinDetails({ palette: parsed.palette, words: parsed.words });
  return {
    caption,
    category,
    slot: category === "wearing" ? normalizeForkWearSlot(parsed.slot) : "",
    shows: normalizeForkPinShows(parsed.shows),
    name: category === "wearing" ? "" : normalizeForkPinName(parsed.name),
    palette: category === "vibe" ? (details.palette ?? []) : [],
    words: category === "vibe" ? (details.words ?? []) : [],
  };
}
