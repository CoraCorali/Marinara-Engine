// Fork feature: chapters (see FORK.md).
//
// Ending a chapter keeps a detailed recap of it and folds its messages away. The writer then reads
// the story from the current chapter's first message, with every finished chapter's recap in the
// summary slot, so a long story keeps its memory without carrying its whole history.
//
// A chapter is a range of the chat's messages, ending at `lastMessageId`. The range is kept as the
// last message's (createdAt, id), the order Marinara lists messages in, so the chapter still ends in
// the same place after that message is deleted. Nothing in a chapter is ever deleted or rewritten
// without the writer: an edit or delete inside it only marks the recap out of date.
import { asc, eq } from "../../db/file-query.js";
import { fileTable, integer, text } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

export const MAX_CHAPTER_TITLE = 80;
export const MAX_CHAPTER_RECAP = 24_000;
/** Recaps beyond this many tokens in total are merged into one "Earlier" recap for the prompt. */
export const DEFAULT_RECAP_BUDGET_TOKENS = 3000;
/** A chapter this long gets a gentle nudge to end it, since very long chapters recap less well. */
export const LONG_CHAPTER_MESSAGES = 150;

export const chapters = fileTable("fork_chapters", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  number: integer("number").notNull().default(1),
  title: text("title").notNull().default(""),
  firstMessageId: text("first_message_id").notNull().default(""),
  firstMessageAt: text("first_message_at").notNull().default(""),
  lastMessageId: text("last_message_id").notNull(),
  lastMessageAt: text("last_message_at").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  /** The recap's sections as markdown (What happened, Where people stand, ...). */
  recap: text("recap").notNull().default(""),
  /** 1 once a message inside the chapter was edited or deleted after the recap was written. */
  stale: integer("stale").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

type ChapterRow = {
  id: string;
  chatId: string;
  number: number;
  title: string;
  firstMessageId: string;
  firstMessageAt: string;
  lastMessageId: string;
  lastMessageAt: string;
  messageCount: number;
  recap: string;
  stale: number;
  createdAt: string;
  updatedAt: string;
};

export type Chapter = Omit<ChapterRow, "stale"> & { stale: boolean };

/** Where an older stretch of recaps was merged into one, for the prompt only. */
export type EarlierRecap = { through: number; text: string };

type MessageKey = { id: string; createdAt: string };

function toChapter(row: ChapterRow): Chapter {
  return { ...row, stale: row.stale === 1 };
}

/** Marinara's message order: createdAt, then id. */
export function compareMessageKeys(left: MessageKey, right: MessageKey): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

/** Whether a message falls inside a chapter (it ends at or after the message). */
export function isInsideChapter(message: MessageKey, chapter: Pick<Chapter, "lastMessageId" | "lastMessageAt">) {
  return compareMessageKeys(message, { id: chapter.lastMessageId, createdAt: chapter.lastMessageAt }) <= 0;
}

/**
 * The finished chapters the writer is past at `endIndex` (exclusive) of `messages`, and the index
 * where the current chapter starts. A swipe or continue passes the index of the message it works
 * on, so inside a finished chapter only the chapters that ended before it count, and the history
 * and recaps it is written against never overlap.
 */
export function chaptersBefore<T extends MessageKey>(
  allChapters: readonly Chapter[],
  messages: readonly T[],
  endIndex = messages.length,
): { finished: Chapter[]; startIndex: number } {
  const finished: Chapter[] = [];
  let startIndex = 0;
  for (const chapter of [...allChapters].sort((a, b) => a.number - b.number)) {
    const end = { id: chapter.lastMessageId, createdAt: chapter.lastMessageAt };
    let next = startIndex;
    while (next < messages.length && compareMessageKeys(messages[next]!, end) <= 0) next++;
    // A chapter counts only once every one of its messages comes before `endIndex`.
    if (next > endIndex) break;
    finished.push(chapter);
    startIndex = next;
  }
  return { finished, startIndex };
}

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

/**
 * The block the writer gets for every finished chapter, oldest first. An "Earlier" recap stands in
 * for the chapters it merged; any chapter after it is sent whole.
 */
export function storySoFarBlock(
  finished: readonly Chapter[],
  earlier: EarlierRecap | null,
  currentChapterNumber: number,
): string {
  if (finished.length === 0) return "";
  const lastFinished = finished[finished.length - 1]!.number;
  const useEarlier = earlier && earlier.text.trim() && earlier.through < lastFinished ? earlier : null;
  const parts: string[] = [
    "The story so far, one recap per finished chapter, oldest first. These events really happened; keep every detail consistent with them.",
  ];
  if (useEarlier) parts.push(`### Earlier (chapters 1–${useEarlier.through})\n${useEarlier.text.trim()}`);
  for (const chapter of finished) {
    if (useEarlier && chapter.number <= useEarlier.through) continue;
    const heading = `### Chapter ${chapter.number}${chapter.title ? ` · ${chapter.title}` : ""}`;
    parts.push(`${heading}\n${chapter.recap.trim() || "(No recap yet.)"}`);
  }
  parts.push(`The story is now in Chapter ${currentChapterNumber}. Its messages follow in the history.`);
  return parts.join("\n\n");
}

/**
 * The finished chapters' recaps plus the rolling summary, which then only covers the current
 * chapter. Either may be empty.
 */
export function combineWithRollingSummary(storySoFar: string, rollingSummary: string | null): string | null {
  const summary = rollingSummary?.trim() ?? "";
  if (!storySoFar) return summary || null;
  return summary ? `${storySoFar}\n\nThis chapter so far:\n${summary}` : storySoFar;
}

/** Whether the recaps sent whole have outgrown the budget, so the older ones should be merged. */
export function needsEarlierMerge(
  finished: readonly Chapter[],
  earlier: EarlierRecap | null,
  budgetTokens = DEFAULT_RECAP_BUDGET_TOKENS,
): boolean {
  // The two newest recaps always stay whole, so there must be something older to merge.
  if (finished.length < 3) return false;
  const through = earlier?.through ?? 0;
  const whole = finished.filter((chapter) => chapter.number > through);
  const total = whole.reduce(
    (sum, chapter) => sum + estimateTokens(chapter.recap),
    estimateTokens(earlier?.text ?? ""),
  );
  return total > budgetTokens && whole.length > 2;
}

function cleanTitle(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_CHAPTER_TITLE) : "";
}

export function readEarlierRecap(metadata: Record<string, unknown>): EarlierRecap | null {
  const value = metadata.forkChaptersEarlier as { through?: unknown; text?: unknown } | undefined;
  if (!value || typeof value !== "object") return null;
  const through = typeof value.through === "number" && Number.isInteger(value.through) ? value.through : 0;
  const text = typeof value.text === "string" ? value.text : "";
  return through > 0 && text.trim() ? { through, text } : null;
}

export function createChaptersStorage(db: DB) {
  async function rows(chatId: string): Promise<ChapterRow[]> {
    return (await db
      .select()
      .from(chapters)
      .where(eq(chapters.chatId, chatId))
      .orderBy(asc(chapters.number))) as unknown as ChapterRow[];
  }

  async function getRow(id: string): Promise<ChapterRow | null> {
    const found = (await db.select().from(chapters).where(eq(chapters.id, id))) as unknown as ChapterRow[];
    return found[0] ?? null;
  }

  return {
    async listForChat(chatId: string): Promise<Chapter[]> {
      return (await rows(chatId)).map(toChapter);
    },

    async get(id: string): Promise<Chapter | null> {
      const row = await getRow(id);
      return row ? toChapter(row) : null;
    },

    async create(input: {
      chatId: string;
      title: string;
      first: MessageKey;
      last: MessageKey;
      messageCount: number;
      recap: string;
    }): Promise<Chapter> {
      const existing = await rows(input.chatId);
      const timestamp = now();
      const row: ChapterRow = {
        id: newId(),
        chatId: input.chatId,
        number: existing.reduce((highest, chapter) => Math.max(highest, chapter.number), 0) + 1,
        title: cleanTitle(input.title),
        firstMessageId: input.first.id,
        firstMessageAt: input.first.createdAt,
        lastMessageId: input.last.id,
        lastMessageAt: input.last.createdAt,
        messageCount: Math.max(0, Math.floor(input.messageCount)),
        recap: input.recap.slice(0, MAX_CHAPTER_RECAP),
        stale: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(chapters).values(row as never);
      return toChapter(row);
    },

    /** The writer's own edit, or a fresh recap. Either way the recap is current again. */
    async update(id: string, patch: { title?: unknown; recap?: unknown }): Promise<Chapter | null> {
      const row = await getRow(id);
      if (!row) return null;
      const next: Partial<ChapterRow> = { stale: 0, updatedAt: now() };
      const title = cleanTitle(patch.title);
      if (title) next.title = title;
      if (typeof patch.recap === "string" && patch.recap.trim()) next.recap = patch.recap.slice(0, MAX_CHAPTER_RECAP);
      await db
        .update(chapters)
        .set(next as never)
        .where(eq(chapters.id, id));
      return toChapter({ ...row, ...next } as ChapterRow);
    },

    async remove(id: string): Promise<void> {
      await db.delete(chapters).where(eq(chapters.id, id));
    },

    async removeChat(chatId: string): Promise<void> {
      for (const row of await rows(chatId)) await db.delete(chapters).where(eq(chapters.id, row.id));
    },

    /** Marks the recaps of the chapters holding these messages as out of date. Returns how many. */
    async markStale(chatId: string, messages: readonly MessageKey[]): Promise<number> {
      if (messages.length === 0) return 0;
      const all = await rows(chatId);
      let marked = 0;
      for (const message of messages) {
        // The first chapter (oldest) that ends at or after the message holds it.
        const holder = all.find((chapter) => isInsideChapter(message, chapter));
        if (!holder || holder.stale === 1) continue;
        holder.stale = 1;
        marked++;
        await db
          .update(chapters)
          .set({ stale: 1 } as never)
          .where(eq(chapters.id, holder.id));
      }
      return marked;
    },
  };
}
