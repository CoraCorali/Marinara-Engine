// Fork feature: Fix this part (see FORK.md).
//
// Rewrites one marked passage of a reply and nothing else. The shape of the request and the
// cleanup of the answer live here, apart from the route, so a regression can pin both.

export const FIX_PART_OPEN = "⟦";
export const FIX_PART_CLOSE = "⟧";
const MAX_REPLY_CHARS = 16000;
const MAX_TURN_CHARS = 2000;
const MAX_INSTRUCTION_CHARS = 600;
const MAX_AVOID_PHRASES = 80;

export const DEFAULT_FIX_INSTRUCTION =
  "Make it fresher and less clichéd. Keep what happens and what is said; change how it is written.";

/**
 * The quick asks arrive as their short English labels. Each one is spelled out here, because "Show
 * it, don't tell it" alone leaves the model to guess what the Player means. A label in another
 * language, or the Player's own words, is passed on as written.
 */
const QUICK_ASKS: Record<string, string> = {
  "less cliché, same meaning":
    "Keep what happens and what is said. Replace stock phrasing with concrete, specific detail that only this scene would have, in plain everyday words.",
  "make it more in character":
    "Make everyone in the passage act and speak the way their card and the story so far say they would, flaws, edges and voice included. Nobody softens, explains their feelings or gives in unless the original already had them do it.",
  "shorter and tighter":
    "Cut it to about two thirds of its length. Keep every action and line that matters; drop restatement, decoration and anything said twice.",
  "show it, don't tell it":
    "Replace named emotions and explanations with what can be seen and heard: actions, bodies, objects and the words people actually say. Let the reader work out the feeling.",
};

function spellOut(instruction: string): string {
  return QUICK_ASKS[instruction.trim().toLocaleLowerCase()] ?? instruction;
}

export interface FixPartRequest {
  /** The whole reply, as stored. */
  reply: string;
  /** The passage to rewrite, as offsets into the reply. */
  start: number;
  end: number;
  instruction?: string | null;
  /** Phrases the rewrite must not use, from the writer's slop list. */
  avoid?: readonly string[];
  /** The writer's turn the reply answered, for context. */
  previousTurn?: string | null;
  /** The writer's own character, so the rewrite never speaks for them. */
  writerName?: string | null;
  /** The characters in the chat, "Name: card text", so "more in character" has something to go on. */
  characters?: readonly string[];
}

export function isValidFixRange(reply: string, start: number, end: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= reply.length;
}

/**
 * A long reply is cut to a window around the marked passage, never from the top: cutting the top
 * would drop the markers of a passage near the end, and the model would rewrite something else.
 */
function replyWindow(marked: string, start: number): string {
  if (marked.length <= MAX_REPLY_CHARS) return marked;
  const from = Math.max(0, Math.min(start - Math.floor(MAX_REPLY_CHARS / 3), marked.length - MAX_REPLY_CHARS));
  const to = from + MAX_REPLY_CHARS;
  return `${from > 0 ? "…" : ""}${marked.slice(from, to)}${to < marked.length ? "…" : ""}`;
}

/** The two messages sent to the model: the editing rules, and the reply with the passage marked. */
export function buildFixPartMessages(request: FixPartRequest): Array<{ role: "system" | "user"; content: string }> {
  const { reply, start, end } = request;
  const marked = `${reply.slice(0, start)}${FIX_PART_OPEN}${reply.slice(start, end)}${FIX_PART_CLOSE}${reply.slice(end)}`;
  const avoid = (request.avoid ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .slice(0, MAX_AVOID_PHRASES);
  const writer = request.writerName?.trim() || "the writer's character";

  const system = [
    `You are a line editor for a roleplay story. The writer marked one passage of a reply with ${FIX_PART_OPEN} and ${FIX_PART_CLOSE}. Rewrite only that passage.`,
    "",
    "- Everything outside the markers stays exactly as it is. Your text replaces only what is between them.",
    "- It must read seamlessly with the text right before and after it: the same point of view, tense, voice and names, and the same formatting conventions, such as asterisks for actions and quotation marks for speech.",
    "- Keep it about the same length unless the writer asks otherwise.",
    "- Characters keep their own voices and edges: a cold one stays cold, a smooth one stays smooth, and nobody turns nicer or more agreeable than the original had them.",
    "- Use plain, specific words, and commas or periods where an em dash might go.",
    `- Never write dialogue, thoughts or actions for ${writer} unless the original passage already did.`,
    ...(avoid.length > 0
      ? [
          "- These overused phrases are on the writer's slop list, so choose other wording for them and their close variants:",
          ...avoid.map((phrase) => `  - ${phrase}`),
        ]
      : []),
    "",
    "Return only the replacement passage: no markers, no quotation marks around it, no notes and no explanation.",
  ].join("\n");

  const previousTurn = (request.previousTurn ?? "").trim().slice(-MAX_TURN_CHARS);
  const instruction =
    spellOut((request.instruction ?? "").trim().slice(0, MAX_INSTRUCTION_CHARS)) || DEFAULT_FIX_INSTRUCTION;
  const cards = (request.characters ?? []).map((card) => card.trim()).filter(Boolean);
  const user = [
    ...(cards.length > 0 ? [`<characters>\n${cards.join("\n\n")}\n</characters>`, ""] : []),
    ...(previousTurn ? [`<the_turn_it_answered>\n${previousTurn}\n</the_turn_it_answered>`, ""] : []),
    `<reply>\n${replyWindow(marked, start)}\n</reply>`,
    "",
    `What to change in the marked passage: ${instruction}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * The replacement from what the model said. Models like to wrap an answer in a code fence, in
 * quotation marks it was not asked for, or to echo the markers; none of that belongs in a story.
 * Quotation marks stay when the original passage itself opened and closed with them.
 */
export function readFixPartReply(raw: string, original: string): string {
  let text = (raw ?? "").trim();
  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fenced) text = fenced[1]!.trim();
  text = text.split(FIX_PART_OPEN).join("").split(FIX_PART_CLOSE).join("").trim();
  const originalQuoted = /^["“].*["”]$/s.test(original.trim());
  if (!originalQuoted && /^["“][\s\S]*["”]$/.test(text) && !/["“”]/.test(text.slice(1, -1))) {
    text = text.slice(1, -1).trim();
  }
  // Keep the passage's own edge whitespace, so it slots back in without gluing words together.
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const trail = original.match(/\s*$/)?.[0] ?? "";
  return text ? `${lead}${text}${trail}` : "";
}
