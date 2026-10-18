// Fork feature: Pocket Phone, part 4 — swipes and fixes on texts (see FORK.md).
//
// The newest text from a character (or a contact) keeps its versions like a story reply does: a
// new version, or back to an earlier one. Any of their texts can be fixed, and your own edited.
import { PHONE_PERSONA, type PhoneMessage } from "./fork-phone.js";
import { phoneVoiceRule } from "./fork-phone-prompt.js";

export const MAX_TEXT_SWIPES = 12;
const MAX_TEXT = 600;

/** A text whose versions can change: the newest message in its thread, written by them. */
export function canSwipePhoneText(message: PhoneMessage, thread: readonly PhoneMessage[]): boolean {
  if (message.kind !== "text" || message.sender === PHONE_PERSONA) return false;
  const shown = thread.filter((entry) => entry.kind === "text" || entry.kind === "photo");
  return shown[shown.length - 1]?.id === message.id;
}

/** The versions after a swipe, and the one shown. Older versions stay; a new one goes at the end. */
export function applyTextSwipe(
  message: Pick<PhoneMessage, "body" | "swipes" | "activeSwipe">,
  change: { to: number } | { added: string },
): { swipes: string[]; activeSwipe: number; body: string } {
  const swipes = message.swipes.length ? [...message.swipes] : [message.body];
  if ("added" in change) {
    swipes.push(change.added);
    const kept = swipes.slice(-MAX_TEXT_SWIPES);
    return { swipes: kept, activeSwipe: kept.length - 1, body: kept[kept.length - 1]! };
  }
  const activeSwipe = Math.min(Math.max(0, change.to), swipes.length - 1);
  return { swipes, activeSwipe, body: swipes[activeSwipe]! };
}

/** The text this one answered: the newest earlier text from the other side, for a fix's context. */
export function textItAnswered(message: PhoneMessage, thread: readonly PhoneMessage[]): string {
  const index = thread.findIndex((entry) => entry.id === message.id);
  return (
    thread
      .slice(0, Math.max(0, index))
      .reverse()
      .find((entry) => (entry.kind === "text" || entry.kind === "photo") && entry.sender !== message.sender)?.body ?? ""
  );
}

/** One turn: another version of the same text, in their voice. */
export function buildTextSwipeMessages(input: {
  name: string;
  /** Who they are: a card's description, or a contact's label and note. */
  who: string;
  personaName: string;
  story: string;
  earlier: { name: string; text: string }[];
  versions: string[];
  /** For a contact: `contactStoryBlock`, their own part in the story. */
  knows?: string;
}): { role: "user"; content: string }[] {
  const persona = input.personaName || "the user's character";
  return [
    {
      role: "user",
      content: [
        `${input.name} is texting ${persona} in an ongoing roleplay story.${input.who ? ` ${input.name}: ${input.who}` : ""}`,
        input.story ? `\nThe latest story (oldest first, for context):\n${input.story}` : "",
        input.knows ?? "",
        input.earlier.length
          ? `\nTheir texts before this one (oldest first):\n${input.earlier.map((line) => `${line.name}: ${line.text}`).join("\n")}`
          : "",
        `\nVersions of ${input.name}'s newest text so far:\n${input.versions.map((version) => `- ${version}`).join("\n")}`,
        `\nWrite a different version of that same text: the same moment and what ${input.name} means to say, in their own voice, with different words. About as long. Never write ${persona}'s words.`,
        phoneVoiceRule(persona),
        "Reply with the text only: no name label, no quotation marks, no notes.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

/** The model's text, cleaned of a "Theo:" label and wrapping quotes. */
export function readTextSwipe(raw: string, name: string): string {
  let text =
    raw
      .trim()
      .split(/\n\s*\n/)[0]
      ?.trim() ?? "";
  if (text.toLowerCase().startsWith(`${name.toLowerCase()}:`)) text = text.slice(name.length + 1).trim();
  if (/^["“].*["”]$/s.test(text)) text = text.slice(1, -1).trim();
  return text.slice(0, MAX_TEXT);
}
