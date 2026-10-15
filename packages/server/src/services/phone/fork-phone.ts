// Fork feature: Pocket Phone (see FORK.md).
//
// Phones inside a roleplay: your persona's and each card character's. A thread is a conversation
// between two sides ("persona", a character id, or "contact:<name>" for someone without a card). It
// is stored once and both sides' phones show it. Every phone message remembers the story reply it
// came after, so a phone the AI wrote to can be taken back with that reply.
import { asc, eq } from "../../db/file-query.js";
import { fileTable, integer, text } from "../../db/file-schema.js";
import type { DB } from "../../db/connection.js";
import { newId, now } from "../../utils/id-generator.js";

export const PHONE_PERSONA = "persona";
export const PHONE_CONTACT = "contact:";
export const MAX_PHONE_TEXT = 2000;
export const MAX_PHONE_MESSAGES_PER_CHAT = 2000;

export const PHONE_MESSAGE_KINDS = ["text", "call", "call_line", "photo", "draft"] as const;
export type PhoneMessageKind = (typeof PHONE_MESSAGE_KINDS)[number];

export const phoneThreads = fileTable("fork_phone_threads", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  /** The two sides, sorted, so one pair is always one thread. */
  a: text("a").notNull(),
  b: text("b").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const phoneMessages = fileTable("fork_phone_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  chatId: text("chat_id").notNull(),
  /** Who sent it: one of the thread's two sides. */
  sender: text("sender").notNull(),
  body: text("body").notNull().default(""),
  kind: text("kind").notNull().default("text"),
  /** The story's time when it was sent ("11:40 PM"), from the world state. */
  storyTime: text("story_time").notNull().default(""),
  /** The story reply it came after, so it shows there in the chat and goes with that reply. */
  afterMessageId: text("after_message_id").notNull().default(""),
  /** "user" for what you wrote; "agent" for what the AI added, which a swipe or delete takes back. */
  source: text("source").notNull().default("user"),
  /** A call groups its lines and its summary card under one id. */
  callId: text("call_id").notNull().default(""),
  /** Versions of an AI-written text, as JSON; the shown one is `body`. */
  swipes: text("swipes").notNull().default("[]"),
  activeSwipe: integer("active_swipe").notNull().default(0),
  /** 1 once the persona's phone has shown it. */
  read: integer("read").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

type ThreadRow = { id: string; chatId: string; a: string; b: string; createdAt: string; updatedAt: string };
type MessageRow = {
  id: string;
  threadId: string;
  chatId: string;
  sender: string;
  body: string;
  kind: string;
  storyTime: string;
  afterMessageId: string;
  source: string;
  callId: string;
  swipes: string;
  activeSwipe: number;
  read: number;
  createdAt: string;
  updatedAt: string;
};

export type PhoneThread = ThreadRow;
export type PhoneMessage = Omit<MessageRow, "swipes" | "read" | "kind" | "source"> & {
  kind: PhoneMessageKind;
  source: "user" | "agent";
  swipes: string[];
  read: boolean;
};

export function phoneSide(value: unknown): string {
  if (typeof value !== "string") return "";
  const side = value.trim();
  if (side.startsWith(PHONE_CONTACT)) {
    const name = side.slice(PHONE_CONTACT.length).replace(/\s+/g, " ").trim().slice(0, 60);
    return name ? `${PHONE_CONTACT}${name}` : "";
  }
  return side.slice(0, 120);
}

/** The pair, sorted, so Kyli–Theo and Theo–Kyli are the same thread. */
export function threadPair(first: string, second: string): [string, string] {
  return first <= second ? [first, second] : [second, first];
}

function toMessage(row: MessageRow): PhoneMessage {
  let swipes: string[] = [];
  try {
    const parsed = JSON.parse(row.swipes || "[]");
    if (Array.isArray(parsed)) swipes = parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    swipes = [];
  }
  return {
    ...row,
    kind: (PHONE_MESSAGE_KINDS as readonly string[]).includes(row.kind) ? (row.kind as PhoneMessageKind) : "text",
    source: row.source === "agent" ? "agent" : "user",
    swipes,
    activeSwipe: row.activeSwipe ?? 0,
    read: row.read === 1,
  };
}

export function createPhoneStorage(db: DB) {
  async function threadRows(chatId: string): Promise<ThreadRow[]> {
    return (await db.select().from(phoneThreads).where(eq(phoneThreads.chatId, chatId))) as unknown as ThreadRow[];
  }
  async function messageRows(chatId: string): Promise<MessageRow[]> {
    return (await db
      .select()
      .from(phoneMessages)
      .where(eq(phoneMessages.chatId, chatId))
      .orderBy(asc(phoneMessages.createdAt))) as unknown as MessageRow[];
  }

  return {
    async listThreads(chatId: string): Promise<PhoneThread[]> {
      return threadRows(chatId);
    },

    async getThread(id: string): Promise<PhoneThread | null> {
      const rows = (await db.select().from(phoneThreads).where(eq(phoneThreads.id, id))) as unknown as ThreadRow[];
      return rows[0] ?? null;
    },

    /** The thread between two sides, made the first time they text. */
    async ensureThread(chatId: string, first: string, second: string): Promise<PhoneThread> {
      const [a, b] = threadPair(phoneSide(first), phoneSide(second));
      const existing = (await threadRows(chatId)).find((thread) => thread.a === a && thread.b === b);
      if (existing) return existing;
      const timestamp = now();
      const row: ThreadRow = { id: newId(), chatId, a, b, createdAt: timestamp, updatedAt: timestamp };
      await db.insert(phoneThreads).values(row as never);
      return row;
    },

    async listMessages(chatId: string): Promise<PhoneMessage[]> {
      return (await messageRows(chatId)).map(toMessage);
    },

    async getMessage(id: string): Promise<PhoneMessage | null> {
      const rows = (await db.select().from(phoneMessages).where(eq(phoneMessages.id, id))) as unknown as MessageRow[];
      return rows[0] ? toMessage(rows[0]) : null;
    },

    async addMessage(input: {
      chatId: string;
      threadId: string;
      sender: string;
      body: string;
      kind?: PhoneMessageKind;
      storyTime?: string;
      afterMessageId?: string;
      source?: "user" | "agent";
      callId?: string;
      read?: boolean;
    }): Promise<PhoneMessage | null> {
      const body = input.body.trim().slice(0, MAX_PHONE_TEXT);
      if (!body && input.kind !== "call") return null;
      const existing = await messageRows(input.chatId);
      if (existing.length >= MAX_PHONE_MESSAGES_PER_CHAT) return null;
      // Texts sent together (a two-text answer) share a millisecond; order is by time, so each one
      // gets a time strictly after the last, or they would show out of order.
      const newest = existing.reduce((latest, row) => (row.createdAt > latest ? row.createdAt : latest), "");
      const clock = now();
      const timestamp = clock > newest ? clock : new Date(Date.parse(newest) + 1).toISOString();
      const row: MessageRow = {
        id: newId(),
        threadId: input.threadId,
        chatId: input.chatId,
        sender: phoneSide(input.sender),
        body,
        kind: input.kind ?? "text",
        storyTime: (input.storyTime ?? "").slice(0, 60),
        afterMessageId: input.afterMessageId ?? "",
        source: input.source ?? "user",
        callId: input.callId ?? "",
        swipes: JSON.stringify(input.source === "agent" && body ? [body] : []),
        activeSwipe: 0,
        read: (input.read ?? input.sender === PHONE_PERSONA) ? 1 : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.insert(phoneMessages).values(row as never);
      await db
        .update(phoneThreads)
        .set({ updatedAt: timestamp } as never)
        .where(eq(phoneThreads.id, input.threadId));
      return toMessage(row);
    },

    async editMessage(id: string, body: string): Promise<PhoneMessage | null> {
      const clean = body.trim().slice(0, MAX_PHONE_TEXT);
      if (!clean) return null;
      await db
        .update(phoneMessages)
        .set({ body: clean, updatedAt: now() } as never)
        .where(eq(phoneMessages.id, id));
      return this.getMessage(id);
    },

    /**
     * A text's words changed (your edit, or a fix of theirs). An AI text's shown version changes
     * with it, so swiping away and back keeps the fix.
     */
    async setText(id: string, body: string): Promise<PhoneMessage | null> {
      const message = await this.getMessage(id);
      const clean = body.trim().slice(0, MAX_PHONE_TEXT);
      if (!message || !clean) return null;
      const swipes = message.swipes.length ? [...message.swipes] : [];
      if (swipes.length) swipes[Math.min(message.activeSwipe, swipes.length - 1)] = clean;
      await db
        .update(phoneMessages)
        .set({ body: clean, swipes: JSON.stringify(swipes), updatedAt: now() } as never)
        .where(eq(phoneMessages.id, id));
      return this.getMessage(id);
    },

    /** A text's versions after a swipe. */
    async setVersions(id: string, versions: { swipes: string[]; activeSwipe: number; body: string }) {
      await db
        .update(phoneMessages)
        .set({
          body: versions.body.slice(0, MAX_PHONE_TEXT),
          swipes: JSON.stringify(versions.swipes.map((swipe) => swipe.slice(0, MAX_PHONE_TEXT))),
          activeSwipe: versions.activeSwipe,
          updatedAt: now(),
        } as never)
        .where(eq(phoneMessages.id, id));
      return this.getMessage(id);
    },

    async removeMessage(id: string): Promise<void> {
      await db.delete(phoneMessages).where(eq(phoneMessages.id, id));
    },

    /** Marks a thread as read on the persona's phone. */
    async markRead(threadId: string): Promise<void> {
      const rows = (await db
        .select()
        .from(phoneMessages)
        .where(eq(phoneMessages.threadId, threadId))) as unknown as MessageRow[];
      for (const row of rows.filter((entry) => entry.read !== 1)) {
        await db
          .update(phoneMessages)
          .set({ read: 1 } as never)
          .where(eq(phoneMessages.id, row.id));
      }
    },

    /** What the AI added after these story replies goes with them (a swipe, a delete). Yours stays. */
    async forgetAgentMessages(chatId: string, replyIds: readonly string[]): Promise<number> {
      if (replyIds.length === 0) return 0;
      const ids = new Set(replyIds);
      let removed = 0;
      for (const row of await messageRows(chatId)) {
        if (row.source !== "agent" || !ids.has(row.afterMessageId)) continue;
        await db.delete(phoneMessages).where(eq(phoneMessages.id, row.id));
        removed++;
      }
      return removed;
    },

    /** A whole conversation and its thread (a deleted contact). */
    async removeThread(threadId: string): Promise<void> {
      const rows = (await db
        .select()
        .from(phoneMessages)
        .where(eq(phoneMessages.threadId, threadId))) as unknown as MessageRow[];
      for (const row of rows) await db.delete(phoneMessages).where(eq(phoneMessages.id, row.id));
      await db.delete(phoneThreads).where(eq(phoneThreads.id, threadId));
    },

    async removeChat(chatId: string): Promise<void> {
      for (const row of await messageRows(chatId)) await db.delete(phoneMessages).where(eq(phoneMessages.id, row.id));
      for (const row of await threadRows(chatId)) await db.delete(phoneThreads).where(eq(phoneThreads.id, row.id));
    },

    /**
     * A branch gets the texts up to its branch point: those after a copied story message, pointing
     * at the copy, and those not tied to any message. Threads come along when they have any.
     */
    async copyToBranch(fromChatId: string, toChatId: string, messageIdMap: ReadonlyMap<string, string>) {
      const threads = new Map<string, string>();
      for (const row of await messageRows(fromChatId)) {
        const after = row.afterMessageId ? messageIdMap.get(row.afterMessageId) : "";
        if (row.afterMessageId && !after) continue;
        let threadId = threads.get(row.threadId);
        if (!threadId) {
          const source = await this.getThread(row.threadId);
          if (!source) continue;
          threadId = (await this.ensureThread(toChatId, source.a, source.b)).id;
          threads.set(row.threadId, threadId);
        }
        await db
          .insert(phoneMessages)
          .values({ ...row, id: newId(), chatId: toChatId, threadId, afterMessageId: after ?? "" } as never);
      }
    },
  };
}
