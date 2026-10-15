// Fork feature: Pocket Phone, part 2 — characters texting and calling on their own (see FORK.md).
//
// After each story reply a small phone agent reads the scene and says who texts or calls, now or a
// little later. Everything here is plain logic so it can be tested without a model: reading the
// agent's answer, the safety caps, the queue of texts waiting to arrive, and taking a run back when
// its reply is swiped or deleted.
import { PHONE_CONTACT, PHONE_PERSONA, PHONE_UNKNOWN, type PhoneMessage, type PhoneThread } from "./fork-phone.js";

/** Texts and calls from characters to the persona per story day, whatever the agent asks for. */
export const PHONE_DAILY_CAP = 10;
/** A character who texted unprompted waits this many replies before doing it again. */
export const PHONE_COOLDOWN_REPLIES = 2;
/** Per run: texts per character, thread lines between others, drafts. */
export const PHONE_TEXTS_PER_RUN = 2;
export const PHONE_THREAD_LINES_PER_RUN = 4;
export const PHONE_DRAFTS_PER_RUN = 2;
/** How many past runs are remembered, for the queue and the cooldown. */
export const PHONE_RUNS_KEPT = 20;
export const PHONE_QUEUE_MAX = 12;
const PHONE_LOG_KEPT = 80;
const MAX_AGENT_TEXT = 600;

export type PhoneQueueItem = {
  id: string;
  kind: "text" | "call";
  /** A card character's id. */
  from: string;
  /** The text, or what a call is about. */
  body: string;
  /** A call's first line when it is picked up. */
  opening: string;
  /** The reply whose run wrote it, and how many replies it waits after that one. */
  fromReply: string;
  after: number;
  /** The reply it arrived with, or "" while it waits. */
  deliveredAt: string;
};

export type PhoneCall = {
  /** The call card's message id. */
  id: string;
  from: string;
  about: string;
  opening: string;
  state: "ringing" | "live";
  /** The reply a ringing call came with; a swipe of it takes the call back. */
  reply: string;
};

export type PhoneRunState = {
  queue: PhoneQueueItem[];
  /** Reply ids that had a phone run, oldest first. */
  runs: string[];
  /** What reached the persona, for the daily cap and the cooldown. */
  log: { reply: string; day: string; from: string; prompted: boolean }[];
  call: PhoneCall | null;
  /** Card characters whose phone the story left within the persona's reach (for peeking). */
  reachable: { reply: string; ids: string[] } | null;
  /** Times the persona looked at a character's phone, newest last. */
  peeks: PhonePeek[];
};

export type PhonePeek = {
  characterId: string;
  /** The reply that left the phone within reach. */
  reply: string;
  storyTime: string;
  /** Threads the persona opened, beyond the list of conversations. */
  threadIds: string[];
  /** When the phone was last looked at (ISO): texts that came later were not seen. */
  at: string;
};

export const PHONE_PEEKS_KEPT = 6;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function str(value: unknown, max = MAX_AGENT_TEXT): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readPhoneRunState(metadata: Record<string, unknown>): PhoneRunState {
  const queue = list(metadata.forkPhoneQueue)
    .map(record)
    .filter((item) => typeof item.id === "string" && typeof item.from === "string")
    .map((item) => ({
      id: String(item.id),
      kind: item.kind === "call" ? ("call" as const) : ("text" as const),
      from: String(item.from),
      body: str(item.body),
      opening: str(item.opening),
      fromReply: str(item.fromReply, 120),
      after: Math.min(3, Math.max(1, Number(item.after) || 1)),
      deliveredAt: str(item.deliveredAt, 120),
    }));
  const call = record(metadata.forkPhoneCall);
  const reachable = record(metadata.forkPhoneReachable);
  return {
    queue,
    runs: list(metadata.forkPhoneRuns).filter((id): id is string => typeof id === "string"),
    log: list(metadata.forkPhoneLog)
      .map(record)
      .map((entry) => ({
        reply: str(entry.reply, 120),
        day: str(entry.day, 120),
        from: str(entry.from, 120),
        prompted: entry.prompted === true,
      })),
    call:
      typeof call.id === "string" && typeof call.from === "string"
        ? {
            id: call.id,
            from: call.from,
            about: str(call.about),
            opening: str(call.opening),
            state: call.state === "live" ? "live" : "ringing",
            reply: str(call.reply, 120),
          }
        : null,
    reachable:
      typeof reachable.reply === "string"
        ? { reply: reachable.reply, ids: list(reachable.ids).filter((id): id is string => typeof id === "string") }
        : null,
    peeks: list(metadata.forkPhonePeeks)
      .map(record)
      .filter((peek) => typeof peek.characterId === "string" && typeof peek.reply === "string")
      .map((peek) => ({
        characterId: String(peek.characterId),
        reply: String(peek.reply),
        storyTime: str(peek.storyTime, 60),
        threadIds: list(peek.threadIds)
          .filter((id): id is string => typeof id === "string")
          .slice(0, 24),
        at: str(peek.at, 40),
      })),
  };
}

export function phoneRunMetadata(state: PhoneRunState): Record<string, unknown> {
  return {
    forkPhonePeeks: state.peeks.slice(-PHONE_PEEKS_KEPT),
    forkPhoneQueue: state.queue,
    forkPhoneRuns: state.runs.slice(-PHONE_RUNS_KEPT),
    forkPhoneLog: state.log.slice(-PHONE_LOG_KEPT),
    forkPhoneCall: state.call,
    forkPhoneReachable: state.reachable,
  };
}

/**
 * Takes back what a reply's run did, before that reply is run again (a swipe) or after it is
 * deleted: what it queued goes, what it delivered from the queue waits again, a call it rang stops.
 * The texts it put on the phones are removed by the storage (`forgetAgentMessages`).
 */
export function rewindPhoneRun(state: PhoneRunState, replyIds: readonly string[]): PhoneRunState {
  const gone = new Set(replyIds);
  return {
    queue: state.queue
      .filter((item) => !gone.has(item.fromReply))
      .map((item) => (gone.has(item.deliveredAt) ? { ...item, deliveredAt: "" } : item)),
    runs: state.runs.filter((id) => !gone.has(id)),
    log: state.log.filter((entry) => !gone.has(entry.reply)),
    call: state.call && state.call.state === "ringing" && gone.has(state.call.reply) ? null : state.call,
    reachable: state.reachable && gone.has(state.reachable.reply) ? null : state.reachable,
    peeks: state.peeks.filter((peek) => !gone.has(peek.reply)),
  };
}

/**
 * A branch's own run state: only what came from replies up to the branch point, pointing at the
 * branch's copies. A queued text delivered after the branch point waits again there; no call rings.
 */
export function branchPhoneRunState(
  state: PhoneRunState,
  replies: ReadonlyMap<string, string>,
  threads: ReadonlyMap<string, string>,
): PhoneRunState {
  const reply = (id: string) => replies.get(id) ?? "";
  return {
    queue: state.queue
      .filter((item) => replies.has(item.fromReply))
      .map((item) => ({ ...item, fromReply: reply(item.fromReply), deliveredAt: reply(item.deliveredAt) })),
    runs: state.runs.map(reply).filter(Boolean),
    log: state.log
      .filter((entry) => replies.has(entry.reply))
      .map((entry) => ({ ...entry, reply: reply(entry.reply) })),
    call: null,
    reachable:
      state.reachable && replies.has(state.reachable.reply)
        ? { ...state.reachable, reply: reply(state.reachable.reply) }
        : null,
    peeks: state.peeks
      .filter((peek) => replies.has(peek.reply))
      .map((peek) => ({
        ...peek,
        reply: reply(peek.reply),
        // A conversation opened points at the branch's copy; a screen (drafts, calls, photos) stays.
        threadIds: peek.threadIds.map((id) => threads.get(id) ?? id),
      })),
  };
}

/** Replies since `replyId` had its run, or Infinity once it is too old to be remembered. */
function repliesSince(runs: readonly string[], replyId: string): number {
  const index = runs.indexOf(replyId);
  return index < 0 ? Infinity : runs.length - 1 - index;
}

/** Waiting items whose time has come once `runs` (ending with this reply) have happened. */
export function dueQueueItems(state: PhoneRunState): PhoneQueueItem[] {
  return state.queue.filter((item) => !item.deliveredAt && repliesSince(state.runs, item.fromReply) >= item.after);
}

/** Sides of a pair with an unanswered text from the persona: the character owes a reply. */
export function owedReplies(threads: readonly PhoneThread[], messages: readonly PhoneMessage[]): Set<string> {
  const owed = new Set<string>();
  for (const thread of threads) {
    if (thread.a !== PHONE_PERSONA && thread.b !== PHONE_PERSONA) continue;
    const texts = messages.filter((message) => message.threadId === thread.id && message.kind === "text");
    if (texts[texts.length - 1]?.sender === PHONE_PERSONA) owed.add(thread.a === PHONE_PERSONA ? thread.b : thread.a);
  }
  return owed;
}

/**
 * No model call while everyone with a phone is right there in the scene and nothing is waiting:
 * no queued text, no call, no text of yours without an answer.
 */
export function shouldSkipPhoneRun(input: {
  castIds: readonly string[];
  presentIds: readonly string[];
  state: PhoneRunState;
  owed: ReadonlySet<string>;
}): boolean {
  if (input.castIds.length === 0) return true;
  const present = new Set(input.presentIds);
  if (!input.castIds.every((id) => present.has(id))) return false;
  if (input.state.queue.some((item) => !item.deliveredAt)) return false;
  return !input.state.call && input.owed.size === 0;
}

export type PhoneAgentAnswer = {
  /** `story`: the story said it happened, so the caps and cooldown never hold it back. */
  texts: { from: string; body: string; when: "now" | "later"; after: number; story?: boolean }[];
  calls: { from: string; about: string; opening: string; when: "now" | "later"; after: number; story?: boolean }[];
  threads: { from: string; to: string; body: string }[];
  drafts: { from: string; to: string; body: string }[];
  send: string[];
  drop: string[];
  reachable: string[];
};

/** Who a name in the agent's answer is: the persona, a card character's id, or a side contact. */
export function phoneSideResolver(
  personaName: string,
  cast: readonly { id: string; name: string }[],
  /** Your saved contacts' names, matched whatever their case. */
  contacts: readonly string[] = [],
) {
  const persona = personaName.trim().toLowerCase();
  return (raw: unknown): string => {
    const name = str(raw, 60);
    const lower = name.toLowerCase();
    if (!lower) return "";
    if (lower === persona || ["you", "user", "persona", "{{user}}"].includes(lower)) return PHONE_PERSONA;
    const exact = cast.find((member) => member.name.trim().toLowerCase() === lower);
    if (exact) return exact.id;
    const saved = contacts.find((contact) => contact.toLowerCase() === lower);
    if (saved) return `${PHONE_CONTACT}${saved}`;
    // "Theo" for "Theo Marchetti", and the other way round.
    const first = cast.find((member) => {
      const own = member.name.trim().toLowerCase();
      return own.split(/\s+/)[0] === lower || lower.split(/\s+/)[0] === own;
    });
    return first ? first.id : `${PHONE_CONTACT}${name}`;
  };
}

/** The agent's JSON, with names turned into sides. Anything malformed is left out. */
export function readPhoneAgentAnswer(
  raw: string,
  sideFor: (name: unknown) => string,
  /** Your saved contacts (as sides): they may text you too. */
  contactSides: ReadonlySet<string> = new Set(),
  /** Unknown numbers already on your phone ("unknown:Deidra"): their next texts join them. */
  unknownSides: ReadonlySet<string> = new Set(),
  /** Each saved contact's "close with" list ("persona" and character ids): they text only these. */
  contactCloseWith: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): PhoneAgentAnswer {
  const empty: PhoneAgentAnswer = { texts: [], calls: [], threads: [], drafts: [], send: [], drop: [], reachable: [] };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return empty;
  let parsed: Record<string, unknown>;
  try {
    parsed = record(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return empty;
  }
  const isCast = (side: string) => Boolean(side) && side !== PHONE_PERSONA && !side.startsWith(PHONE_CONTACT);
  const timing = (item: Record<string, unknown>) => {
    const later = item.when === "later" || item.when === "idle";
    return {
      when: later ? ("later" as const) : ("now" as const),
      after: later ? Math.min(3, Math.max(1, Math.round(Number(item.after) || 1))) : 0,
    };
  };
  // Someone not saved: an unknown number, when the agent says so or already texted from one.
  const textSender = (side: string, unsaved: boolean) => {
    if (!side.startsWith(PHONE_CONTACT) || contactSides.has(side)) return side;
    const unknown = `${PHONE_UNKNOWN}${side.slice(PHONE_CONTACT.length)}`;
    return unsaved || unknownSides.has(unknown) ? unknown : side;
  };
  // A contact reaches only those they are close with; the story saying they did always counts.
  const reaches = (from: string, to: string, story = false) => story || contactCloseWith.get(from)?.has(to) !== false;
  const queue = record(parsed.queue);
  return {
    texts: list(parsed.texts)
      .map(record)
      .map((item) => ({
        from: textSender(sideFor(item.from), item.unsaved === true),
        body: str(item.body),
        ...timing(item),
        ...(item.story === true ? { story: true } : {}),
      }))
      .filter(
        (item) =>
          (isCast(item.from) || contactSides.has(item.from) || item.from.startsWith(PHONE_UNKNOWN)) &&
          item.body &&
          reaches(item.from, "persona", item.story),
      ),
    calls: list(parsed.calls)
      .map(record)
      .map((item) => ({
        from: textSender(sideFor(item.from), item.unsaved === true),
        about: str(item.about, 200),
        opening: str(item.opening),
        ...timing(item),
        ...(item.story === true ? { story: true } : {}),
      }))
      .filter(
        (item) =>
          (isCast(item.from) || contactSides.has(item.from) || item.from.startsWith(PHONE_UNKNOWN)) &&
          reaches(item.from, "persona", item.story),
      ),
    // Between others only: a card character on one side, never the persona.
    threads: list(parsed.threads)
      .map(record)
      .map((item) => ({ from: sideFor(item.from), to: sideFor(item.to), body: str(item.body) }))
      .filter(
        (item) =>
          item.body &&
          item.from &&
          item.to &&
          item.from !== item.to &&
          item.from !== PHONE_PERSONA &&
          item.to !== PHONE_PERSONA &&
          (isCast(item.from) || isCast(item.to)) &&
          reaches(item.from, item.to) &&
          reaches(item.to, item.from),
      ),
    drafts: list(parsed.drafts)
      .map(record)
      .map((item) => ({ from: sideFor(item.from), to: sideFor(item.to), body: str(item.body) }))
      .filter((item) => isCast(item.from) && item.to && item.to !== item.from && item.body),
    send: list(queue.send).filter((id): id is string => typeof id === "string"),
    drop: list(queue.drop).filter((id): id is string => typeof id === "string"),
    reachable: [...new Set(list(parsed.reachable).map(sideFor).filter(isCast))],
  };
}

export type PhoneRunPlan = {
  /** Arrives now, in order: texts and at most one ringing call. */
  deliver: { kind: "text" | "call"; from: string; body: string; opening: string; queueId?: string }[];
  threads: PhoneAgentAnswer["threads"];
  drafts: PhoneAgentAnswer["drafts"];
  state: PhoneRunState;
};

/**
 * What this run does, within the caps: due and early-sent queue items arrive, dropped ones go, new
 * "later" items join the queue, "now" items arrive. A character answering your text skips the
 * cooldown; nothing gets past the daily cap. One call rings at a time; another waits a reply.
 */
export function planPhoneRun(input: {
  state: PhoneRunState;
  answer: PhoneAgentAnswer;
  replyId: string;
  day: string;
  owed: ReadonlySet<string>;
  newId: () => string;
}): PhoneRunPlan {
  const { answer, replyId, day, owed } = input;
  const state: PhoneRunState = {
    ...input.state,
    queue: input.state.queue
      .filter((item) => !input.answer.drop.includes(item.id) || item.deliveredAt)
      .map((item) => ({ ...item })),
    runs: input.state.runs.includes(replyId) ? input.state.runs : [...input.state.runs, replyId],
    log: [...input.state.log],
  };
  const deliver: PhoneRunPlan["deliver"] = [];
  let usedToday = state.log.filter((entry) => entry.day === day).length;
  const recentRuns = new Set(state.runs.slice(-PHONE_COOLDOWN_REPLIES - 1, -1));
  const cooling = new Set(
    state.log.filter((entry) => !entry.prompted && recentRuns.has(entry.reply)).map((entry) => entry.from),
  );
  let callTaken = Boolean(state.call);
  const queued: PhoneQueueItem[] = [];
  const take = (
    item: Omit<PhoneRunPlan["deliver"][number], "queueId"> & { queueId?: string },
    story = false,
  ): boolean => {
    if (usedToday >= PHONE_DAILY_CAP && !story) return false;
    if (item.kind === "call") {
      if (callTaken) return false;
      callTaken = true;
    }
    usedToday++;
    deliver.push(item);
    state.log.push({ reply: replyId, day, from: item.from, prompted: owed.has(item.from) });
    return true;
  };

  const due = new Set(dueQueueItems(state).map((item) => item.id));
  for (const item of state.queue) {
    if (item.deliveredAt || !(due.has(item.id) || answer.send.includes(item.id))) continue;
    if (take({ kind: item.kind, from: item.from, body: item.body, opening: item.opening, queueId: item.id })) {
      item.deliveredAt = replyId;
    } else if (item.kind === "call" && usedToday < PHONE_DAILY_CAP) {
      item.after += 1; // a call already on the line: this one rings after the next reply
    }
  }

  const perCharacter = new Map<string, number>();
  for (const text of answer.texts) {
    const count = perCharacter.get(text.from) ?? 0;
    if (count >= PHONE_TEXTS_PER_RUN) continue;
    if (cooling.has(text.from) && !owed.has(text.from) && !text.story) continue;
    perCharacter.set(text.from, count + 1);
    if (text.when === "later" && !text.story) {
      queued.push({
        id: input.newId(),
        kind: "text",
        from: text.from,
        body: text.body,
        opening: "",
        fromReply: replyId,
        after: text.after,
        deliveredAt: "",
      });
    } else {
      take({ kind: "text", from: text.from, body: text.body, opening: "" }, text.story);
    }
  }
  for (const call of answer.calls.slice(0, 1)) {
    if (cooling.has(call.from) && !owed.has(call.from) && !call.story) continue;
    const later = (call.when === "later" && !call.story) || callTaken;
    if (later) {
      queued.push({
        id: input.newId(),
        kind: "call",
        from: call.from,
        body: call.about,
        opening: call.opening,
        fromReply: replyId,
        after: Math.max(1, call.after),
        deliveredAt: "",
      });
    } else {
      take({ kind: "call", from: call.from, body: call.about, opening: call.opening }, call.story);
    }
  }

  // Delivered items are kept while their reply could still be swiped, so a swipe can put them back.
  const remembered = new Set(state.runs.slice(-PHONE_RUNS_KEPT));
  state.queue = [...state.queue, ...queued]
    .filter((item) => (item.deliveredAt ? remembered.has(item.deliveredAt) : true))
    .slice(-PHONE_QUEUE_MAX);
  return {
    deliver,
    threads: answer.threads.slice(0, PHONE_THREAD_LINES_PER_RUN),
    drafts: answer.drafts.slice(0, PHONE_DRAFTS_PER_RUN),
    state,
  };
}

/** Everything still waiting arrives because you sat in the chat for a while. Same daily cap. */
export function planIdleDelivery(state: PhoneRunState, anchorReply: string, day: string): PhoneRunPlan {
  const waiting = state.queue.filter((item) => !item.deliveredAt).map((item) => item.id);
  const plan = planPhoneRun({
    state,
    answer: { texts: [], calls: [], threads: [], drafts: [], send: waiting, drop: [], reachable: [] },
    replyId: anchorReply,
    day,
    owed: new Set(),
    newId: () => "",
  });
  // The idle wait is not a story reply: it does not count toward later items' waits.
  return { ...plan, state: { ...plan.state, runs: state.runs } };
}

export type PhoneAgentContext = {
  personaName: string;
  /** present: null when the world state does not track who is in the scene. */
  cast: { name: string; about: string; present: boolean | null }[];
  date: string;
  time: string;
  location: string;
  people: string;
  story: string;
  phones: string;
  owed: string[];
  queue: { id: string; who: string; kind: string; body: string; status: string }[];
  call: string;
  /** The persona's own contacts: "Mom (family): worries a lot". */
  contacts?: string[];
};

/**
 * One user turn (some gateways ignore a system message on short calls). The agent is told that
 * silence is the usual answer: a phone that buzzes every reply stops feeling like a person.
 */
export function buildPhoneAgentMessages(context: PhoneAgentContext): { role: "user"; content: string }[] {
  const persona = context.personaName || "the user's character";
  const castLines = context.cast.map((member) => {
    const where = member.present === null ? "" : member.present ? " (in the scene now)" : " (not in the scene)";
    return `- ${member.name}${where}${member.about ? `: ${member.about}` : ""}`;
  });
  const queueLines = context.queue.map(
    (item) => `- ${item.id} · ${item.who} · ${item.kind} · ${item.status}: ${item.body}`,
  );
  const content = [
    `You run the phones in an ongoing roleplay story. After each story reply you decide whether any character texts or calls ${persona}, and whether characters text other people about things happening off-page.`,
    `Only ${persona} (the user's character) and these card characters have phones:`,
    ...castLines,
    "Anyone else (Mom, a coworker, a supplier) is a side contact who exists only inside a card character's phone.",
    context.contacts?.length
      ? `${persona}'s own contacts (people with no card, who can text or call ${persona} too, rarely, about their own lives, their own part in the story or what ${persona} texted them; they were not in the story's scenes, so they know only what ${persona} texted them and what they themselves did, wrote or said in the story, like a letter they sent. One listed as close with card characters can also text those characters in threads; they reach only the people they are close with, and follow how they text):\n${context.contacts.map((line) => `- ${line}`).join("\n")}`
      : "",
    context.cast.some((member) => member.present === null) ? "Judge from the story who is in the scene." : "",
    "",
    `Story time: ${[context.date, context.time].filter(Boolean).join(", ") || "unknown"}. Place: ${context.location || "unknown"}.`,
    context.people ? `\nPeople:\n${context.people}` : "",
    `\nThe latest story (oldest first):\n${context.story || "(nothing yet)"}`,
    context.phones ? `\n${context.phones}` : "",
    context.owed.length ? `\n${persona} texted ${context.owed.join(", ")} and is waiting for an answer.` : "",
    context.call ? `\n${context.call}` : "",
    queueLines.length ? `\nWritten earlier and not sent yet:\n${queueLines.join("\n")}` : "",
    "\nRules:",
    `- When the story says someone texted or called ${persona} (a text came in, the phone rang), that text or call must be on the phone (unless it already is): send it "now", from that person, with words that fit the story, and set "story": true. This comes before everything below.`,
    `- Someone ${persona} has not saved (not a card character, not one of ${persona}'s contacts) can still text ${persona}: put their name in "from" and set "unsaved": true, and ${persona}'s phone shows an unknown number. They know only their own part in the story. They can call the same way ("unsaved": true on the call).`,
    "- Otherwise most replies need nothing. Text or call only when this character really would right now, given who they are and what just happened. Empty lists are the usual answer.",
    `- Anyone can text ${persona} at any time, even from across the room mid-scene, but only when that is something they would really do.`,
    `- Answer ${persona}'s unanswered texts when the character would have seen them and wants to reply.`,
    "- Texts read like that person's real texts: short, in their voice, no narration, no quotation marks, no stage directions.",
    `- Never write ${persona}'s texts or words.`,
    '- "when": "now" arrives right after this reply; "later" waits "after" story replies (1 to 3).',
    `- Calls are for things that cannot wait or a voice they want to hear, from a card character, one of ${persona}'s contacts or an unknown number. About: a few words. Opening: their first line when picked up.`,
    `- threads: texts between a card character and someone other than ${persona} (another card character or a side contact), for what is happening in their own lives or what they say about ${persona}. Private; ${persona} does not see them. Only when it adds to the story.`,
    "- drafts: something a card character typed and did not send.",
    `- reachable: card characters whose phone the story just left within ${persona}'s reach (set down, left unlocked). Usually empty.`,
    "- queue: ids of earlier items to send now, or to drop because the story moved past them (a time skip, the moment passed).",
    "\nReply with JSON only, in this shape:",
    '{"texts":[{"from":"Name","body":"text","when":"now","after":0,"unsaved":false,"story":false}],"calls":[{"from":"Name","about":"a few words","opening":"first line","when":"now","after":0,"unsaved":false,"story":false}],"threads":[{"from":"Name","to":"Name","body":"text"}],"drafts":[{"from":"Name","to":"Name","body":"text"}],"queue":{"send":[],"drop":[]},"reachable":[]}',
  ]
    .filter((line) => line !== "")
    .join("\n");
  return [{ role: "user", content }];
}

/** One turn: the character's next line on a call, nothing else. */
export function buildCallLineMessages(input: {
  characterName: string;
  /** Who they are, for a contact with no card: "Kyli's family: worries a lot". */
  who?: string;
  about: string;
  personaName: string;
  story: string;
  lines: { name: string; text: string }[];
  /** For a contact: `contactStoryBlock`, their own part in the story. */
  knows?: string;
}): { role: "user"; content: string }[] {
  const persona = input.personaName || "the user's character";
  return [
    {
      role: "user",
      content: [
        `${input.characterName} is on a phone call with ${persona} in an ongoing roleplay story.${input.about ? ` The call is about: ${input.about}.` : ""}`,
        input.who ? `${input.characterName} is ${input.who}. They only know what ${persona} has told them.` : "",
        input.knows ?? "",
        input.story ? `\nThe latest story (oldest first):\n${input.story}` : "",
        `\nThe call so far:\n${input.lines.map((line) => `${line.name}: ${line.text}`).join("\n") || "(just picked up)"}`,
        `\nWrite ${input.characterName}'s next spoken line only, in their own voice: one to three short sentences, the way people talk on the phone. No narration, no name label, no quotation marks. Never write ${persona}'s words.`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

/** A model line cleaned of a leading "Theo:" label and wrapping quotes. */
export function cleanSpokenLine(raw: string, name: string): string {
  let line = raw.trim();
  const label = `${name}:`;
  if (line.toLowerCase().startsWith(label.toLowerCase())) line = line.slice(label.length).trim();
  if (/^["“].*["”]$/s.test(line)) line = line.slice(1, -1).trim();
  return line.slice(0, MAX_AGENT_TEXT);
}

/** Story passages that name a contact, newest last: "Deidra cousin" is found as "Deidra" too. */
export function passagesNaming(name: string, passages: readonly string[], max = 3): string[] {
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = name.trim().split(/\s+/)[0] ?? "";
  const words = [name.trim(), ...(first.length >= 3 && first !== name.trim() ? [first] : [])].filter(Boolean);
  if (words.length === 0) return [];
  const named = new RegExp(`(^|[^\\p{L}])(${words.map(escape).join("|")})(?![\\p{L}])`, "iu");
  return passages.filter((passage) => named.test(passage)).slice(-max);
}

/**
 * The story a contact took part in from afar: passages that name them, with the rule that they
 * know only their own part (a letter they wrote, a call they made), never the rest of the scene.
 */
export function contactStoryBlock(name: string, personaName: string, passages: readonly string[]): string {
  if (passages.length === 0) return "";
  const persona = personaName || "the user's character";
  return [
    `\nStory passages that mention ${name} (oldest first). ${name} was not there. From these, ${name} knows only their own part: what they themselves did, wrote or said (a letter or message they sent, a call they made), and must stay true to it. Everything else in them (what ${persona} or anyone else did, saw, thought or found out) ${name} does not know.`,
    ...passages.map((passage) => `---\n${passage}`),
    "---",
  ].join("\n");
}

/**
 * A contact's answer to your texts. They were not in the story's scenes: they know only what you
 * have told them, plus their own life.
 */
export function buildContactReplyMessages(input: {
  name: string;
  /** "Kyli's family: worries a lot, texts in all caps". */
  who: string;
  personaName: string;
  storyTime: string;
  texts: { name: string; text: string; time: string }[];
  /** `contactStoryBlock`: their own part in the story, when it names them. */
  knows?: string;
}): { role: "user"; content: string }[] {
  const persona = input.personaName || "the user's character";
  return [
    {
      role: "user",
      content: [
        `${input.name} is ${input.who}, texting with ${persona}. ${input.name} is not in ${persona}'s scenes and knows nothing about ${persona}'s day except what ${persona} has texted them below, plus their own life${input.knows ? " and their own part in the passages below" : ""}.`,
        input.storyTime ? `Time now: ${input.storyTime}.` : "",
        input.knows ?? "",
        `\nTheir texts so far (oldest first):\n${input.texts.map((text) => `- ${text.time ? `[${text.time}] ` : ""}${text.name}: ${text.text}`).join("\n")}`,
        `\nWrite ${input.name}'s reply: one to three short texts in their own voice, the way they would really text ${persona}. Only mention things ${persona} has texted about or that are part of ${input.name}'s own life; never anything else that happened to ${persona}. No narration, no quotation marks. Never write ${persona}'s texts.`,
        'Reply with JSON only: {"texts":["text","text"]}',
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

/**
 * A card character answers your texts right away. They are in the story, so they get its latest
 * part; they may leave you on read when the story has them busy, asleep or right next to you.
 */
export function buildCharacterReplyMessages(input: {
  name: string;
  about: string;
  personaName: string;
  story: string;
  storyTime: string;
  location: string;
  /** True while the scene has them with the persona. */
  present: boolean;
  texts: { name: string; text: string; time: string }[];
}): { role: "user"; content: string }[] {
  const persona = input.personaName || "the user's character";
  return [
    {
      role: "user",
      content: [
        `${input.name} is texting with ${persona} in an ongoing roleplay story.${input.about ? ` ${input.name}: ${input.about}` : ""}`,
        input.story ? `\nThe latest story (oldest first):\n${input.story}` : "",
        [
          input.storyTime ? `Time now: ${input.storyTime}.` : "",
          input.location ? `The scene is at: ${input.location}.` : "",
          input.present ? `${input.name} is in the scene with ${persona} right now.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        `\nTheir texts so far (oldest first):\n${input.texts.map((text) => `- ${text.time ? `[${text.time}] ` : ""}${text.name}: ${text.text}`).join("\n")}`,
        `\nWrite ${input.name}'s reply: one to three short texts in their own voice, the way they would really text ${persona}, true to what is happening in the story right now. If the story has ${input.name} unable to answer (asleep, busy, phone away, right next to ${persona}), send nothing. No narration, no quotation marks. Never write ${persona}'s texts.`,
        'Reply with JSON only: {"texts":["text","text"]}, or {"texts":[]} to send nothing.',
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

/** The contact's texts, from JSON or, failing that, one text per line. At most three. */
export function readContactReply(raw: string): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  let texts: unknown[] = [];
  if (start >= 0 && end > start) {
    try {
      texts = list(record(JSON.parse(raw.slice(start, end + 1))).texts);
    } catch {
      texts = [];
    }
  }
  if (texts.length === 0 && start < 0) texts = raw.split(/\n+/);
  return texts
    .map((text) => str(text).replace(/^["“]|["”]$/g, ""))
    .filter(Boolean)
    .slice(0, 3);
}
