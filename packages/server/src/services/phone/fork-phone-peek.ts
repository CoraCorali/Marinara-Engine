// Fork feature: Pocket Phone, part 3 — a character's own phone, and peeking at it (see FORK.md).
//
// A character's phone is written once, the first time the persona looks at it, from the story so
// far: their threads with other people, drafts they never sent, photos described in words, and
// calls. It is saved, so looking again shows the same phone. What the persona saw is told to the
// story's writer afterwards.
import {
  FORK_PHONE_COLORS,
  FORK_PHONE_SKINS,
  normalizeForkPhoneLook,
  type ForkPhoneLook,
} from "@marinara-engine/shared";
import { PHONE_PERSONA, type PhoneMessage, type PhoneThread } from "./fork-phone.js";
import type { PhonePeek } from "./fork-phone-agent.js";

export const WRITTEN_THREADS_MAX = 5;
export const WRITTEN_TEXTS_PER_THREAD = 8;
export const WRITTEN_PHOTOS_MAX = 6;
export const WRITTEN_DRAFTS_MAX = 3;
export const WRITTEN_CALLS_MAX = 6;
/** Lines of each opened thread the writer is told about. */
export const PEEK_LINES_PER_THREAD = 6;
const MAX_TEXT = 600;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function str(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Characters whose phone has been written, with their camera roll. Kept in chat metadata. */
export type WrittenPhones = Record<string, { photos: string[] }>;

export function readWrittenPhones(metadata: Record<string, unknown>): WrittenPhones {
  const written: WrittenPhones = {};
  for (const [id, value] of Object.entries(record(metadata.forkPhoneWritten)).slice(0, 24)) {
    written[id] = {
      photos: list(record(value).photos)
        .map((photo) => str(photo, 300))
        .filter(Boolean)
        .slice(0, WRITTEN_PHOTOS_MAX),
    };
  }
  return written;
}

export type WrittenPhone = {
  look: Partial<ForkPhoneLook> | null;
  threads: { with: string; texts: { mine: boolean; body: string; time: string; photo: boolean }[] }[];
  drafts: { to: string; body: string }[];
  photos: string[];
  calls: { with: string; about: string; outgoing: boolean; missed: boolean; time: string }[];
};

/**
 * The model's phone, made safe: never the persona's thread (that one is real and already shared),
 * never a thread with themselves, and within the caps.
 */
export function readWrittenPhone(raw: string, owner: string, sideFor: (name: unknown) => string): WrittenPhone | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const parsed = record(parseLooseJson(raw.slice(start, end + 1)));
  if (Object.keys(parsed).length === 0) return null;
  const other = (name: unknown) => {
    const side = sideFor(name);
    return side && side !== owner && side !== PHONE_PERSONA ? side : "";
  };
  const lookRaw = record(parsed.look);
  const skin = (FORK_PHONE_SKINS as readonly string[]).includes(lookRaw.skin as string) ? lookRaw.skin : undefined;
  const look = skin
    ? normalizeForkPhoneLook({
        skin,
        color: lookRaw.color,
        gems: lookRaw.gems === true,
        stickers: lookRaw.stickers === true,
      })
    : null;
  const seen = new Set<string>();
  const threads = list(parsed.threads)
    .map(record)
    .map((thread) => ({
      with: other(thread.with),
      texts: list(thread.texts)
        .map(record)
        .map((text) => {
          const photo = str(text.photo);
          return {
            mine: text.from === "me" || sideFor(text.from) === owner,
            body: photo || str(text.body),
            time: str(text.time, 60),
            photo: Boolean(photo),
          };
        })
        .filter((text) => text.body)
        .slice(-WRITTEN_TEXTS_PER_THREAD),
    }))
    .filter((thread) => thread.with && thread.texts.length && !seen.has(thread.with) && seen.add(thread.with))
    .slice(0, WRITTEN_THREADS_MAX);
  return {
    look,
    threads,
    drafts: list(parsed.drafts)
      .map(record)
      .map((draft) => ({ to: sideFor(draft.to), body: str(draft.body) }))
      .filter((draft) => draft.to && draft.to !== owner && draft.body)
      .slice(0, WRITTEN_DRAFTS_MAX),
    photos: list(parsed.photos)
      .map((photo) => str(photo, 300))
      .filter(Boolean)
      .slice(0, WRITTEN_PHOTOS_MAX),
    calls: list(parsed.calls)
      .map(record)
      .map((call) => ({
        with: other(call.with),
        about: str(call.about, 200),
        outgoing: call.outgoing === true,
        missed: call.missed === true,
        time: str(call.time, 60),
      }))
      .filter((call) => call.with)
      .slice(0, WRITTEN_CALLS_MAX),
  };
}

/**
 * JSON.parse that forgives a stray closing bracket, the slip models make most in long JSON
 * ("...]},"calls":...). Drops the bracket where parsing breaks, a few times at most.
 * ponytail: only that one slip is repaired; anything else still fails and the person taps Peek again.
 */
export function parseLooseJson(text: string): unknown {
  let current = text;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return JSON.parse(current);
    } catch (error) {
      const at = Number(/position (\d+)/.exec(String(error))?.[1]);
      const before = current.slice(0, at).trimEnd();
      if (!Number.isFinite(at) || !/[}\]]$/.test(before)) return null;
      current = before.slice(0, -1) + current.slice(at);
    }
  }
  return null;
}

export type PhoneWriteContext = {
  ownerName: string;
  ownerAbout: string;
  personaName: string;
  others: string[];
  people: string;
  story: string;
  /** What is already on this phone (the real thread with the persona, earlier private texts). */
  existing: string;
};

/** One user turn, like the phone agent: some gateways ignore a short call's system message. */
export function buildPhoneWriteMessages(context: PhoneWriteContext): { role: "user"; content: string }[] {
  const persona = context.personaName || "the user's character";
  const skins = FORK_PHONE_SKINS.map((skin) => `${skin} (${FORK_PHONE_COLORS[skin].join(", ")})`).join("; ");
  const content = [
    `Write what is on ${context.ownerName}'s phone right now, in an ongoing roleplay story. ${persona} is about to look at it without ${context.ownerName} knowing.`,
    context.ownerAbout ? `${context.ownerName}: ${context.ownerAbout}` : "",
    context.others.length
      ? `Other people in the story with phones: ${context.others.join(", ")}. Anyone else (family, coworkers, an ex) is a side contact with just a name.`
      : "Anyone else (family, coworkers, an ex) is a side contact with just a name.",
    context.people ? `\nPeople:\n${context.people}` : "",
    `\nThe latest story (oldest first):\n${context.story || "(nothing yet)"}`,
    context.existing
      ? `\nAlready on the phone (keep consistent; do not repeat or rewrite these):\n${context.existing}`
      : "",
    "\nRules:",
    `- Write it from what the story has shown about ${context.ownerName}'s life, people and worries. Everyday and specific, never a list of secrets. One or two things may be telling; the rest is ordinary.`,
    `- Never write texts between ${context.ownerName} and ${persona}: that conversation is already on the phone.`,
    `- threads: up to ${WRITTEN_THREADS_MAX} conversations with other people, ${WRITTEN_TEXTS_PER_THREAD} texts at most each, oldest first. "from" is "me" for ${context.ownerName}, or the other person's name. A text can be a photo: put a short description in "photo" instead of "body".`,
    `- drafts: up to ${WRITTEN_DRAFTS_MAX} texts typed and never sent (to anyone, ${persona} included).`,
    `- photos: up to ${WRITTEN_PHOTOS_MAX} pictures in the camera roll, each a short description.`,
    `- calls: up to ${WRITTEN_CALLS_MAX} recent calls with other people.`,
    `- look: the phone that suits ${context.ownerName}. Skins and colours: ${skins}. gems (rhinestones) and stickers (candybar only) are true or false.`,
    '- Texts read like that person\'s real texts. Times are story times like "9:14 PM" or "Tue".',
    "\nReply with JSON only, in this shape:",
    '{"look":{"skin":"slider","color":"midnight","gems":false,"stickers":false},"threads":[{"with":"Name","texts":[{"from":"me","body":"text","time":"9:14 PM"},{"from":"Name","photo":"a blurry photo of the bakery sign"}]}],"drafts":[{"to":"Name","body":"text"}],"photos":["description"],"calls":[{"with":"Name","about":"a few words","outgoing":false,"missed":true,"time":"Tue"}]}',
  ]
    .filter((line) => line !== "")
    .join("\n");
  return [{ role: "user", content }];
}

/**
 * What the writer is told about the persona's recent peeks: the conversations listed on the screen
 * (each with its newest line) and the lines of every conversation opened. Whether the
 * character notices is left to the story.
 */
export function peekPromptBlock(
  peeks: readonly PhonePeek[],
  threads: readonly PhoneThread[],
  messages: readonly PhoneMessage[],
  personaName: string,
  nameOf: (side: string) => string,
): string {
  const persona = personaName || "the user's character";
  // One section per phone: looking again adds what was opened, and moves "when" to the latest look.
  const byOwner = new Map<string, PhonePeek>();
  for (const peek of peeks) {
    const earlier = byOwner.get(peek.characterId);
    byOwner.set(
      peek.characterId,
      earlier ? { ...peek, threadIds: [...new Set([...earlier.threadIds, ...peek.threadIds])] } : peek,
    );
  }
  const sections = [...byOwner.values()].map((peek) => {
    const owner = nameOf(peek.characterId) || "someone";
    const theirs = threads.filter((thread) => thread.a === peek.characterId || thread.b === peek.characterId);
    const linesOf = (thread: PhoneThread) =>
      messages.filter(
        (message) =>
          message.threadId === thread.id &&
          // Texts that came after the look were not on the screen.
          (!peek.at || message.createdAt <= peek.at) &&
          (message.kind === "text" ||
            message.kind === "photo" ||
            (message.kind === "draft" && message.sender === peek.characterId)),
      );
    const label = (side: string) => (side === peek.characterId ? owner : nameOf(side) || "someone");
    const say = (message: PhoneMessage) =>
      `${label(message.sender)}: ${message.kind === "photo" ? `(a photo) ${message.body}` : message.kind === "draft" ? `(unsent draft) ${message.body}` : message.body}`;
    const list = theirs.flatMap((thread) => {
      const other = thread.a === peek.characterId ? thread.b : thread.a;
      const last = linesOf(thread).at(-1);
      return last ? [`- ${label(other)} — ${say(last)}`] : [];
    });
    const opened = theirs
      .filter((thread) => peek.threadIds.includes(thread.id))
      .map((thread) => {
        const other = thread.a === peek.characterId ? thread.b : thread.a;
        return [
          `${persona} opened the conversation with ${label(other)}:`,
          ...linesOf(thread)
            .slice(-PEEK_LINES_PER_THREAD)
            .map((message) => `  ${say(message)}`),
        ].join("\n");
      });
    return [
      `${persona} looked at ${owner}'s phone${peek.storyTime ? ` at ${peek.storyTime}` : ""} without asking and saw the list of conversations:`,
      ...(list.length ? list : ["- (nothing much)"]),
      ...opened,
    ].join("\n");
  });
  if (sections.length === 0) return "";
  return [
    ...sections,
    `${persona} remembers what was on the screen. Whether anyone noticed the look is up to the story; nobody knows unless the story shows it.`,
  ].join("\n\n");
}
