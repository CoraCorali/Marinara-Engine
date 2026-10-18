// Fork feature: writing a chapter's recap (see FORK.md).
//
// The recap is the story's long-term memory once a chapter folds away, so it is written in a fixed
// shape the writer can rely on, and long enough to continue from. A long chapter is cut into slices
// that are each noted down first, then merged, so its middle is not lost to one model call.
type ChatMessage = { role: "system" | "user"; content: string };

export const RECAP_SLICE_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 3000;

export type RecapSourceMessage = { role: string; name: string; content: string };

export const RECAP_SECTIONS = [
  "What happened",
  "Where people stand",
  "Open threads",
  "Keep in mind",
  "Lines to remember",
] as const;

/** Markup out, words kept: a reply's HTML panels still say what happened. */
export function plainMessageText(content: string): string {
  return content
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

export function transcript(messages: readonly RecapSourceMessage[]): string {
  return messages
    .map((message) => ({ ...message, text: plainMessageText(message.content) }))
    .filter((message) => message.text)
    .map((message) => `${message.name}: ${message.text}`)
    .join("\n\n");
}

/** Even slices of at most `size`: 48 messages become two of 24, not 40 and 8. */
export function sliceMessages<T>(messages: readonly T[], size = RECAP_SLICE_MESSAGES): T[][] {
  const count = Math.max(1, Math.ceil(messages.length / size));
  const each = Math.ceil(messages.length / count);
  const slices: T[][] = [];
  for (let index = 0; index < messages.length; index += each) slices.push(messages.slice(index, index + each));
  return slices;
}

/** About one sentence per three or four messages, never under 200 words (eight sentences or so). */
export function targetSentences(messageCount: number): number {
  return Math.max(8, Math.ceil(messageCount / 3.5));
}

type RecapContext = {
  chapterNumber: number;
  messageCount: number;
  personaName: string;
  /** Where every relationship stands now, from People, so the recap never disagrees with it. */
  people: string;
  /** Titles of the chapters before, for continuity. */
  previousTitles: string[];
};

const SHAPE = `Write the recap in exactly this shape, in plain text, with nothing before or after it:

Title: a short title for the chapter, story-flavoured, at most six words

## What happened
The events in order, as prose paragraphs. Use names, places and story dates or times when they are known. Say who did what and why it mattered.

## Where people stand
One line per relationship, as it stands at the chapter's end: "- Name and Name: where they stand, and what changed this chapter". Keep tension, grudges and power between them as sharp as the chapter left them.

## Open threads
One line each: promises, secrets, plans, unanswered questions, and anything a character is hiding.

## Keep in mind
One line each: objects, outfits, injuries, places and running jokes that matter later.

## Lines to remember
Two or three exact quotes worth calling back, each as: - "the quote" (who said it)`;

function contextLines(context: RecapContext): string {
  return [
    `This is Chapter ${context.chapterNumber} of a roleplay. ${context.personaName} is the user's character.`,
    context.previousTitles.length
      ? `Earlier chapters: ${context.previousTitles.map((title, index) => `${index + 1}. ${title}`).join("; ")}.`
      : "",
    context.people
      ? `Where relationships stand now, from the story's tracker. "Where people stand" must agree with this:\n${context.people}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const RULES = `Rules:
- Only what happened in the chapter. Never invent events, and never continue the story.
- Detailed enough that the story can be continued from the recap alone, without the messages.
- Third person, past tense. No commentary about the writing, the roleplay or the user.
- Record things as they actually stand. A fight that ended unresolved stays unresolved, a lie that was never found out is still a secret, and nobody is kinder or closer in the recap than they were in the story.
- Plain words, with commas or periods where an em dash might go.`;

/** One call for a chapter short enough to read whole. */
export function buildRecapMessages(messages: readonly RecapSourceMessage[], context: RecapContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write chapter recaps for a long roleplay story. The recap replaces the chapter's messages as the story's memory, so it must keep everything that matters.\n\n${RULES}\n\n${SHAPE}`,
    },
    {
      role: "user",
      content: `${contextLines(context)}\n\nThe chapter (${context.messageCount} messages):\n\n${transcript(messages)}\n\nWrite the recap. "What happened" should be about ${targetSentences(context.messageCount)} sentences.`,
    },
  ];
}

/** Notes on one slice of a long chapter, to be merged into the recap afterwards. */
export function buildSliceNoteMessages(
  slice: readonly RecapSourceMessage[],
  part: number,
  parts: number,
  context: RecapContext,
  /** The notes on the part before, so this part knows what has already happened. */
  previousNotes = "",
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You take detailed notes on one part of a roleplay chapter. The notes are merged with the other parts into the chapter's recap later.\n\n${RULES}\n\nWrite plain notes: the events in order (with names, places and story times), then any promise, secret, object, injury or outfit that matters later, then up to two exact quotes worth keeping.`,
    },
    {
      role: "user",
      content: `${contextLines(context)}${
        previousNotes.trim()
          ? `\n\nNotes on part ${part - 1}, for context only (do not repeat them; name anything this part refers back to):\n${previousNotes.trim()}`
          : ""
      }\n\nPart ${part} of ${parts} of the chapter:\n\n${transcript(slice)}\n\nWrite the notes for this part, about ${targetSentences(slice.length)} sentences of events.`,
    },
  ];
}

/** The recap of a long chapter, from its parts' notes. */
export function buildMergeMessages(notes: readonly string[], context: RecapContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write chapter recaps for a long roleplay story from notes on each part of the chapter. The recap replaces the chapter's messages as the story's memory, so it must keep everything that matters from every part, the middle included.\n\n${RULES}\n\n${SHAPE}`,
    },
    {
      role: "user",
      content: `${contextLines(context)}\n\nNotes on the chapter, part by part (${context.messageCount} messages in all):\n\n${notes
        .map((note, index) => `[Part ${index + 1}]\n${note.trim()}`)
        .join(
          "\n\n",
        )}\n\nWrite the recap. "What happened" should be about ${targetSentences(context.messageCount)} sentences.`,
    },
  ];
}

/** Older recaps merged into one, for stories whose recaps outgrew the prompt budget. */
export function buildEarlierMergeMessages(
  recaps: readonly { number: number; title: string; recap: string }[],
  previous: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You condense the early chapters of a long roleplay into one recap of the story so far. Keep every event that later chapters might depend on, every open thread that is still open, and how each relationship developed, including the tension and grudges that are still live. Drop moment-to-moment detail. Plain text with the same section headings as the recaps you are given (## What happened, ## Where people stand, ## Open threads, ## Keep in mind). Never invent anything.`,
    },
    {
      role: "user",
      content: `${previous.trim() ? `[Earlier, already condensed]\n${previous.trim()}\n\n` : ""}${recaps
        .map((recap) => `[Chapter ${recap.number}${recap.title ? ` · ${recap.title}` : ""}]\n${recap.recap.trim()}`)
        .join("\n\n")}\n\nWrite the condensed recap of these chapters, about half their combined length.`,
    },
  ];
}

/** The title line and the sections, from what the model wrote. Null when nothing usable came back. */
export function readRecap(raw: string): { title: string; recap: string } | null {
  let text = raw
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
  if (!text) return null;
  let title = "";
  const titleMatch = text.match(/^\**\s*title\s*:?\**\s*:?\s*(.+)$/im);
  if (titleMatch && titleMatch.index !== undefined && titleMatch.index < 200) {
    title = titleMatch[1]!.replace(/[*_#"]/g, "").trim();
    text = (text.slice(0, titleMatch.index) + text.slice(titleMatch.index + titleMatch[0].length)).trim();
  }
  // Anything before the first section is preamble ("Here is the recap:").
  const firstSection = text.search(/^##\s/m);
  if (firstSection > 0) text = text.slice(firstSection).trim();
  if (!text) return null;
  return { title, recap: text };
}
