// Fork feature: Fix this part (see FORK.md).
//
// Rewrites one marked passage of a reply and nothing else. The shape of the request and the
// cleanup of the answer live here, apart from the route, so a regression can pin both.

export const FIX_PART_OPEN = "⟦";
export const FIX_PART_CLOSE = "⟧";
const MAX_REPLY_CHARS = 16000;
const MAX_TURN_CHARS = 2000;
const MAX_INSTRUCTION_CHARS = 600;
const MAX_AVOID_PHRASES = 200;

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
    "Make it sound and move like these specific people. In dialogue, use the words, rhythm and attitude their card gives them. In narration, change the verbs and the details the camera lands on so they fit how this character carries himself or herself and what he or she would actually do or notice. Keep every action, body detail and image the original had; rewrite how they are told, do not drop them. Nobody softens, explains their feelings or gives in unless the original already had them do it.",
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

/**
 * How every rewrite is written, by hand or automatic. The Undertow lines (tags, second-person
 * sensation lines, explicit words, no new body description) keep a fix from breaking what the
 * preset and the regex pack rely on, or swapping one stand-in for another.
 */
function lineEditorRules(writer: string, avoid: readonly string[]): string[] {
  return [
    "- It must read seamlessly with the text right before and after it: the same point of view, tense, voice and names, and the same formatting: asterisks, quotation marks, and every HTML tag (such as a <span style=...> around a character's speech) kept exactly as written, in the same place around the same words.",
    '- A sentence written in second person ("The sheet was cold under your knees.") stays in second person; everything else keeps the person it was in.',
    "- Keep what is there. Every action, object, body detail and line of dialogue in the passage stays in the rewrite unless the writer asks to cut it. You change how it is written, not what is in it. Add no new description of anyone's body.",
    "- Keep it about the same length unless the writer asks otherwise.",
    "- Write it the way a sharp, unsentimental novelist would film it: concrete, physical, specific. Name the exact thing in everyday words (shoulder, thigh, sink) instead of a vague or grand one.",
    '- In a sex scene, name bodies in plain explicit words (cock, pussy, clit, ass, tits, cum). Heat and wetness are things a body feels, never a name for one: no "her heat," "walls," "entrance," "core," "length," "bud" or "slick" standing in for a body part or for wetness, and no clinical terms.',
    "- Fold features into motion instead of listing them, and vary sentence length. Do not stack three parallel adjectives or clauses; keep the strongest one or two.",
    "- Swap a stock verb or image for a plain specific one. Do not reach for dramatic words like loomed, hefted, smirked or predatory, and add no new metaphor unless the original had one.",
    '- Say what a thing is, never what it isn\'t: no "not X, but Y" shapes. No "really", "truly" or "genuinely" for emphasis.',
    "- Characters keep their own voices and edges: a cold one stays cold, a crude one stays crude, a smooth one stays smooth, and nobody turns nicer or more agreeable than the original had them. Dialogue keeps the speaker's own words, slang and grammar.",
    "- Use plain, specific words, and commas or periods where an em dash might go.",
    `- Never write dialogue, thoughts or actions for ${writer} unless the original passage already did.`,
    ...(avoid.length > 0
      ? [
          "- Hard rule: the rewrite must not contain any of these phrases from the writer's slop list, or close variants of them. If the original used one, replace it with different, plain wording:",
          ...avoid.map((phrase) => `  - ${phrase}`),
        ]
      : []),
  ];
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
    ...lineEditorRules(writer, avoid),
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

export interface AutoFixPassage {
  start: number;
  end: number;
  /** The listed phrases found in it, so the model knows what to change. */
  phrases: readonly string[];
}

export interface AutoFixRequest extends Omit<FixPartRequest, "start" | "end" | "instruction"> {
  passages: readonly AutoFixPassage[];
}

/** Passages that are in the reply, in order, with no two overlapping. */
export function validAutoFixPassages(reply: string, passages: readonly AutoFixPassage[]): boolean {
  if (passages.length === 0) return false;
  let lastEnd = 0;
  for (const passage of passages) {
    if (!isValidFixRange(reply, passage.start, passage.end) || passage.start < lastEnd) return false;
    lastEnd = passage.end;
  }
  return true;
}

/** Undertow's header, notes and ledger: never marked, and only noise around the story for a line editor. */
const NOT_STORY_BLOCK =
  /<(scene_header|margin_notes|story_ledger|authors_note|author_note|thought|think|thinking)\b[^>]{0,2000}>[\s\S]*?<\/\1>\s*/gi;

/** The marked reply as the editor reads it: the story alone, cut down around the first mark if long. */
function storyContext(marked: string): string {
  const story = marked.replace(NOT_STORY_BLOCK, "").trim();
  if (story.length <= MAX_REPLY_CHARS) return story;
  const from = Math.max(0, Math.min(story.indexOf(FIX_PART_OPEN) - 2000, story.length - MAX_REPLY_CHARS));
  return `${from > 0 ? "…" : ""}${story.slice(from, from + MAX_REPLY_CHARS)}${from + MAX_REPLY_CHARS < story.length ? "…" : ""}`;
}

/**
 * The automatic pass: every sentence holding a listed phrase is marked and numbered in one copy of
 * the reply, so one call fixes them all with the whole reply around them. Each comes back in its
 * own numbered <fix> tag; anything missing or broken is simply left as it was (see readAutoFixReply).
 */
export function buildAutoFixMessages(request: AutoFixRequest): Array<{ role: "system" | "user"; content: string }> {
  const { reply, passages } = request;
  let marked = "";
  let at = 0;
  passages.forEach((passage, index) => {
    const n = index + 1;
    marked += `${reply.slice(at, passage.start)}${FIX_PART_OPEN}${n}:${reply.slice(passage.start, passage.end)}${FIX_PART_CLOSE}`;
    at = passage.end;
  });
  marked += reply.slice(at);
  const avoid = (request.avoid ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .slice(0, MAX_AVOID_PHRASES);
  const writer = request.writerName?.trim() || "the writer's character";

  const system = [
    `You are a line editor for a roleplay story. Some sentences of a reply are marked like ${FIX_PART_OPEN}1:sentence${FIX_PART_CLOSE}, each numbered, because they use stock phrases from the writer's slop list. Rewrite only the marked sentences so the stock phrases are gone.`,
    "",
    "- Everything outside the markers stays exactly as it is. Change as little as it takes: swap the stock phrase for plain, specific words that fit this moment and keep the rest of the sentence.",
    ...lineEditorRules(writer, avoid),
    "",
    'Return one <fix n="number">rewritten sentence</fix> for each marked sentence, in order, and nothing else: no markers, no notes and no explanation.',
  ].join("\n");

  const previousTurn = (request.previousTurn ?? "").trim().slice(-MAX_TURN_CHARS);
  const cards = (request.characters ?? []).map((card) => card.trim()).filter(Boolean);
  const list = passages.map(
    (passage, index) => `${index + 1}: ${passage.phrases.map((phrase) => `"${phrase}"`).join(", ")}`,
  );
  const user = [
    ...(cards.length > 0 ? [`<characters>\n${cards.join("\n\n")}\n</characters>`, ""] : []),
    ...(previousTurn ? [`<the_turn_it_answered>\n${previousTurn}\n</the_turn_it_answered>`, ""] : []),
    `<reply>\n${storyContext(marked)}\n</reply>`,
    "",
    "The stock phrases in each marked sentence:",
    ...list,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * The rewritten sentences by number, cleaned the way a single fix is. A missing, empty or marker-
 * bearing answer becomes null, which keeps that sentence as it was.
 */
export function readAutoFixReply(raw: string, originals: readonly string[]): Array<string | null> {
  const found = new Map<number, string>();
  for (const match of (raw ?? "").matchAll(/<fix\s+n\s*=\s*["']?(\d+)["']?\s*>([\s\S]*?)<\/fix>/gi)) {
    const n = Number(match[1]);
    if (!found.has(n)) found.set(n, match[2] ?? "");
  }
  return originals.map((original, index) => {
    const text = found.get(index + 1);
    if (text === undefined || text.includes(FIX_PART_OPEN) || text.includes(FIX_PART_CLOSE)) return null;
    const cleaned = readFixPartReply(text, original);
    return cleaned.trim() ? cleaned : null;
  });
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

/** Slop-list phrases that turn up in a rewrite: case-insensitive, whole words, curly apostrophes as straight. */
export function findAvoidedPhrases(text: string, avoid: readonly string[]): string[] {
  const norm = (value: string) => value.replace(/[\u2018\u2019]/g, "'").toLocaleLowerCase();
  const haystack = norm(text);
  const hits: string[] = [];
  for (const phrase of avoid) {
    const needle = norm(phrase.trim());
    if (!needle) continue;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(haystack)) hits.push(phrase.trim());
  }
  return hits;
}
