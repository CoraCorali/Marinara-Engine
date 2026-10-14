// Fork feature: the reference board's shapes, shared by the server and the client (see FORK.md).

/** What a pin is of. The server's table normalises to these too. */
export const BOARD_PIN_CATEGORIES_SHARED = ["wearing", "place", "person", "thing", "vibe"] as const;

/** What a wearing pin covers. A full outfit can be on a model or laid out with no one in it. */
export const FORK_WEAR_SLOTS = [
  "outfit",
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "bag",
  "jewelry",
  "hair",
  "makeup",
  "nails",
] as const;
export type ForkWearSlot = (typeof FORK_WEAR_SLOTS)[number];

/** Whether the picture shows the clothes on someone, or just the clothes. */
export const FORK_PIN_SHOWS = ["model", "clothes"] as const;
export type ForkPinShows = (typeof FORK_PIN_SHOWS)[number];

/** Who a pin is about: the persona, a character by id, or the scene itself. */
export const FORK_PIN_WHO_PERSONA = "persona";
export const FORK_PIN_WHO_SCENE = "scene";

export function normalizeForkWearSlot(value: unknown): ForkWearSlot | "" {
  const wanted = typeof value === "string" ? value.trim().toLowerCase() : "";
  return FORK_WEAR_SLOTS.includes(wanted as ForkWearSlot) ? (wanted as ForkWearSlot) : "";
}

export function normalizeForkPinShows(value: unknown): ForkPinShows {
  return value === "clothes" ? "clothes" : "model";
}

/**
 * The slots a newly worn piece takes over for the same person. A full outfit replaces the clothes
 * it is made of; a dress replaces a top and a bottom; pieces like shoes, a bag or hair sit on top of
 * whatever else is worn and only replace their own kind.
 */
export function forkWearSlotsReplacedBy(slot: ForkWearSlot | ""): ForkWearSlot[] {
  switch (slot) {
    case "outfit":
      return ["outfit", "top", "bottom", "dress"];
    case "dress":
      return ["dress", "top", "bottom"];
    case "top":
      return ["top", "dress"];
    case "bottom":
      return ["bottom", "dress"];
    case "":
      return [];
    default:
      return [slot];
  }
}

const STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "her",
  "his",
  "their",
  "she",
  "he",
  "they",
  "a",
  "an",
  "of",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "wearing",
  "wears",
  "worn",
  "that",
  "this",
  "my",
  "your",
  "its",
  "to",
  "from",
]);

function words(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Whether a message mentions what a pin shows: two caption words in a row ("fluffy boots",
 * "blue sundress"), or the whole caption when it is a single word ("Mira"). A single shared word
 * like "dress" is not enough, or every pin would ride along with every message.
 */
export function forkMessageMentionsPin(message: string, caption: string): boolean {
  const captionWords = words(caption).filter((word) => !STOPWORDS.has(word));
  if (captionWords.length === 0) return false;
  // Stopwords leave the message too, so "dress with lace" still finds the "dress lace" pair.
  const messageText = ` ${words(message)
    .filter((word) => !STOPWORDS.has(word))
    .join(" ")} `;
  if (captionWords.length === 1) return captionWords[0]!.length >= 3 && messageText.includes(` ${captionWords[0]} `);
  for (let index = 0; index < captionWords.length - 1; index += 1) {
    if (messageText.includes(` ${captionWords[index]} ${captionWords[index + 1]} `)) return true;
  }
  return false;
}
