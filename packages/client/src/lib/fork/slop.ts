// Fork feature: the slop highlighter and Fix this part (see FORK.md).

/**
 * A starting list of the phrases models reach for again and again. It is only a starting point:
 * the writer edits it, and the edited list is what gets highlighted and what a rewrite is told to
 * avoid.
 */
export const DEFAULT_SLOP_PHRASES: readonly string[] = [
  "shiver down her spine",
  "shiver down his spine",
  "shivers down",
  "barely above a whisper",
  "ministrations",
  "a mix of",
  "a mixture of",
  "mischievous glint",
  "glint in her eye",
  "glint in his eye",
  "eyes sparkling with",
  "the air was thick with",
  "the air thick with",
  "testament to",
  "tapestry",
  "a dance of",
  "couldn't help but",
  "maybe, just maybe",
  "for what felt like an eternity",
  "a wave of",
  "stark contrast",
  "palpable",
  "breath she didn't know she was holding",
  "breath he didn't know he was holding",
  "voice dropping to",
  "voice low and",
  "chuckles darkly",
  "eyes darkening",
  "pupils dilated",
  "the weight of",
  "something shifted",
  "the world narrowed",
  "knuckles white",
  "jaw clenched",
  "smirks",
  "smirked",
  "padded over",
  "ozone",
  "electric",
  "unspoken promise",
  "a hint of",
  "sending a jolt",
  "despite herself",
  "despite himself",
  "in the grand scheme",
  "a beat passes",
];

export interface TextMatch {
  start: number;
  end: number;
  phrase: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Curly and straight apostrophes are the same apostrophe for matching purposes. */
function phrasePattern(phrase: string): string {
  return escapeRegExp(phrase.trim()).replace(/'/g, "['’]");
}

/**
 * Every place a phrase from the list appears, matched whole-word and without regard to case.
 * Longer phrases win where two overlap, so "shiver down her spine" is one mark, not two.
 */
export function findSlopMatches(text: string, phrases: readonly string[]): TextMatch[] {
  const wanted = [...new Set(phrases.map((phrase) => phrase.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );
  if (!text || wanted.length === 0) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${wanted.map(phrasePattern).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const matches: TextMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    matches.push({ start, end: start + match[0].length, phrase: match[0] });
  }
  return matches;
}

/** Characters markdown adds to the stored text that never appear on screen. */
const MARKUP = new Set(["*", "_", "~", "`"]);
const QUOTES: Record<string, string> = { "“": '"', "”": '"', "„": '"', "‘": "'", "’": "'" };

/** Text reduced to what matters for finding it again, with each kept character's original index. */
function normalizeWithMap(text: string): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  let lastWasSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (MARKUP.has(char)) continue;
    if (/\s/.test(char)) {
      if (lastWasSpace || normalized.length === 0) continue;
      normalized += " ";
      map.push(index);
      lastWasSpace = true;
      continue;
    }
    normalized += (QUOTES[char] ?? char).toLocaleLowerCase();
    map.push(index);
    lastWasSpace = false;
  }
  return { normalized, map };
}

/**
 * Where a passage picked on screen sits in the stored reply.
 *
 * The screen shows the reply after markdown is rendered, so the stored text has asterisks and
 * underscores the selection does not, and curly quotes may differ. Both sides are reduced the same
 * way and the match is mapped back to stored offsets. Returns null when the passage is not in the
 * stored text at all, which happens when a display-only regex script rewrote what is shown.
 */
export function locatePassage(stored: string, picked: string): { start: number; end: number } | null {
  const target = normalizeWithMap(picked).normalized.trim();
  if (!target) return null;
  const { normalized, map } = normalizeWithMap(stored);
  const at = normalized.indexOf(target);
  if (at < 0) return null;
  return balanceMarkup(stored, map[at]!, map[at + target.length - 1]! + 1);
}

function markupBalanced(text: string): boolean {
  for (const mark of MARKUP) {
    if (text.split(mark).length % 2 === 0) return false;
  }
  return true;
}

/**
 * Take in the asterisks and underscores that open or close right at the passage's edges, when doing
 * so leaves every marker paired. Picking "barely above a whisper" out of "**barely above a
 * whisper**" should hand over the bold with it, or a rewrite would leave four stray asterisks
 * behind; picking a sentence that opens in italics should take the opening asterisk with it.
 */
function balanceMarkup(stored: string, start: number, end: number): { start: number; end: number } {
  let from = start;
  let to = end;
  while (from > 0 && MARKUP.has(stored[from - 1]!)) from -= 1;
  while (to < stored.length && MARKUP.has(stored[to]!)) to += 1;
  if (markupBalanced(stored.slice(from, to))) return { start: from, end: to };
  return { start, end };
}

/**
 * The sentence around a stretch of text: what a tapped slop phrase expands to, since a phrase on
 * its own is too small a thing to rewrite well. Stops at sentence punctuation or a line break.
 */
export function sentenceAround(text: string, start: number, end: number): { start: number; end: number } {
  let from = start;
  while (from > 0 && !/[.!?…\n]/.test(text[from - 1]!)) from -= 1;
  while (from < start && /\s/.test(text[from]!)) from += 1;
  let to = end;
  while (to < text.length && !/[.!?…\n]/.test(text[to]!)) to += 1;
  // Keep the closing punctuation and any quote or asterisk that closes the sentence with it.
  while (to < text.length && /[.!?…"”'’*_]/.test(text[to]!)) to += 1;
  return { start: from, end: to };
}

/** The reply with one passage swapped out. */
export function replacePassage(stored: string, start: number, end: number, replacement: string): string {
  return `${stored.slice(0, start)}${replacement}${stored.slice(end)}`;
}
