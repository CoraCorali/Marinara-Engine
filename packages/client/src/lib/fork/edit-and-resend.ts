// Fork feature: Edit & resend (see FORK.md).

type ResendCandidate = { id: string; role: string };

/**
 * The user message that "Edit & resend" may act on: the newest message when it is the user's,
 * or the user message right before a single trailing assistant reply. Anything else returns null,
 * so a resend never strands later turns that were written against the old wording.
 */
export function getResendableUserMessageId(messages: readonly ResendCandidate[] | null | undefined): string | null {
  if (!messages?.length) return null;
  let index = messages.length - 1;
  if (messages[index]!.role === "assistant") index -= 1;
  const candidate = messages[index];
  return candidate?.role === "user" ? candidate.id : null;
}
