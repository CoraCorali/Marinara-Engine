// Fork feature: what the story's writer is told about the phones (see FORK.md).
import { PHONE_CONTACT, PHONE_PERSONA, type PhoneMessage, type PhoneThread } from "./fork-phone.js";

export const PHONE_TEXTS_PER_THREAD = 8;
export const PHONE_RECENT_CALLS = 4;
/** The last lines of each recent call, so the writer knows what was said. */
export const PHONE_CALL_LINES = 6;

/** "Theo", "Kyli", or a side contact's own name. */
export function phoneSideName(side: string, personaName: string, nameFor: (id: string) => string): string {
  if (side === PHONE_PERSONA) return personaName || "the user's character";
  if (side.startsWith(PHONE_CONTACT)) return side.slice(PHONE_CONTACT.length);
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
            `- ${message.storyTime ? `[${message.storyTime}] ` : ""}${name(message.sender)}: ${message.kind === "photo" ? `(a photo) ${message.body}` : message.body}`,
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
  if (sections.length === 0) return "";
  return [
    "On the phones (these texts and calls really happened in the story; the characters remember them and can bring them up):",
    ...sections,
  ].join("\n\n");
}
