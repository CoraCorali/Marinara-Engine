// Fork feature: what the story's writer is told about the phones (see FORK.md).
import { FORK_PHONE_CONTACT_PERSONA, forkPhoneRelationWord, type ForkPhoneContact } from "@marinara-engine/shared";
import { PHONE_CONTACT, PHONE_PERSONA, PHONE_UNKNOWN, type PhoneMessage, type PhoneThread } from "./fork-phone.js";

export const PHONE_TEXTS_PER_THREAD = 8;
export const PHONE_RECENT_CALLS = 4;
/** The last lines of each recent call, so the writer knows what was said. */
export const PHONE_CALL_LINES = 6;

/** "Theo", "Kyli", or a side contact's own name. */
export function phoneSideName(side: string, personaName: string, nameFor: (id: string) => string): string {
  if (side === PHONE_PERSONA) return personaName || "the user's character";
  if (side.startsWith(PHONE_CONTACT)) return side.slice(PHONE_CONTACT.length);
  if (side.startsWith(PHONE_UNKNOWN)) return `an unknown number (really ${side.slice(PHONE_UNKNOWN.length)})`;
  return nameFor(side) || "someone";
}

/**
 * The phone block in the fork note: the last few texts in each thread with the persona, with the
 * story time they were sent, and the latest calls. Texts live outside the story's history, so
 * without this the writer would never know what was said.
 */
export function phonePromptBlock(
  threads: readonly PhoneThread[],
  messages: readonly PhoneMessage[],
  personaName: string,
  nameFor: (id: string) => string,
  /** The persona's saved contacts: "Mom (family): worries a lot". */
  contacts: readonly string[] = [],
): string {
  const name = (side: string) => phoneSideName(side, personaName, nameFor);
  const sections: string[] = [];
  for (const thread of threads) {
    if (thread.a !== PHONE_PERSONA && thread.b !== PHONE_PERSONA) continue;
    const other = thread.a === PHONE_PERSONA ? thread.b : thread.a;
    const texts = messages
      .filter((message) => message.threadId === thread.id && (message.kind === "text" || message.kind === "photo"))
      .slice(-PHONE_TEXTS_PER_THREAD);
    if (texts.length === 0) continue;
    sections.push(
      [
        `Texts between ${name(PHONE_PERSONA)} and ${name(other)} (oldest first):`,
        ...texts.map(
          (message) =>
            `- ${message.storyTime ? `[${message.storyTime}] ` : ""}${name(message.sender)}: ${message.kind === "photo" ? `(a photo) ${message.body}` : message.body}${message.seenAt ? ` (seen${message.seenAt === "seen" ? "" : ` at ${message.seenAt}`}, not answered)` : ""}`,
        ),
      ].join("\n"),
    );
  }
  const calls = messages
    .filter((message) => message.kind === "call")
    .slice(-PHONE_RECENT_CALLS)
    .flatMap((call) => {
      const thread = threads.find((entry) => entry.id === call.threadId);
      if (!thread || (thread.a !== PHONE_PERSONA && thread.b !== PHONE_PERSONA)) return [];
      const other = thread.a === PHONE_PERSONA ? thread.b : thread.a;
      const who =
        call.sender === PHONE_PERSONA
          ? `${name(PHONE_PERSONA)} called ${name(other)}`
          : `${name(call.sender)} called ${name(PHONE_PERSONA)}`;
      const lines = messages
        .filter((line) => line.kind === "call_line" && line.callId === call.id)
        .slice(-PHONE_CALL_LINES)
        .map((line) => `  ${name(line.sender)}: ${line.body}`);
      return [`- ${who}${call.storyTime ? ` at ${call.storyTime}` : ""}${call.body ? `: ${call.body}` : ""}`, ...lines];
    });
  if (calls.length) sections.push(["Recent calls:", ...calls].join("\n"));
  if (contacts.length) {
    sections.push(
      [
        `${name(PHONE_PERSONA)}'s contacts (no part in the scenes; they know only what ${name(PHONE_PERSONA)} tells them and their own part, like a letter they sent):`,
        ...contacts.map((line) => `- ${line}`),
      ].join("\n"),
    );
  }
  if (sections.length === 0) return "";
  const unknown = threads.some((thread) => thread.a.startsWith(PHONE_UNKNOWN) || thread.b.startsWith(PHONE_UNKNOWN));
  if (unknown) {
    sections.push(
      `An unknown number is someone ${name(PHONE_PERSONA)} has not saved: the phone shows no name, so ${name(PHONE_PERSONA)} does not know who it is unless the texts say so.`,
    );
  }
  return [
    "On the phones (these texts and calls really happened in the story; the characters remember them and can bring them up):",
    ...sections,
  ].join("\n\n");
}

/**
 * For the story's writer while the phone is on: texts live on the phone, so a text written out in
 * the narration would be one the phone never shows and its sender never remembers.
 */
export const PHONE_WRITER_RULE =
  "New texts and calls arrive on the phones rather than in the narration. The story can say a phone buzzed or someone is typing, and characters can quote or react to texts already on the phones, while the words of a new text, call or message stay on the phone. This holds over any other instruction to show phone screens, chat bubbles or texts in the reply.";

/**
 * How anyone on the phone sounds. A character who is furious in the story should not text like a
 * greeting card, and models drift sweet on a phone more than anywhere else.
 */
export function phoneVoiceRule(personaName: string): string {
  const persona = personaName || "the user's character";
  return `They text and talk the way they feel about ${persona} right now: annoyed stays short, distant stays distant, a grudge or a secret still shows, and nobody gets sweeter just because it is a phone. Typos, caps and lowercase only if that is how they type. Commas or periods where an em dash might go.`;
}

/**
 * Who a contact is close to, by name, when that is more than just the persona (the default):
 * "Kyli, Charles". `nameOf` turns "persona" and character ids into names.
 */
function closeWithNames(contact: ForkPhoneContact, nameOf?: (id: string) => string): string {
  if (!nameOf) return "";
  if (contact.closeWith.length === 1 && contact.closeWith[0] === FORK_PHONE_CONTACT_PERSONA) return "";
  return contact.closeWith.map(nameOf).filter(Boolean).join(", ");
}

/** "Mom (family): worries a lot. Personality: …", for the lists the models read. */
export function contactLine(contact: ForkPhoneContact, nameOf?: (id: string) => string): string {
  const close = closeWithNames(contact, nameOf);
  return [
    `${contact.name} (${forkPhoneRelationWord(contact)})${contact.note ? `: ${contact.note}` : ""}`,
    contact.personality ? ` Personality: ${contact.personality}.` : "",
    contact.texting ? ` How they text: ${contact.texting}.` : "",
    close ? ` Close with: ${close}.` : "",
  ].join("");
}

/** "Kyli's family (worries a lot)", for a contact speaking for themselves. */
export function contactWho(contact: ForkPhoneContact, personaName: string, nameOf?: (id: string) => string): string {
  const close = closeWithNames(contact, nameOf);
  return [
    `${personaName || "the user's character"}'s ${forkPhoneRelationWord(contact)}${contact.note ? ` (${contact.note})` : ""}`,
    contact.personality ? `; personality: ${contact.personality}` : "",
    contact.texting ? `; how they text: ${contact.texting}` : "",
    close ? `; close with ${close}` : "",
  ].join("");
}
