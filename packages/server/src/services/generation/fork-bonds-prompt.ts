// Fork feature: tell the model where each bond stands (see FORK.md).
import type { ForkBondKind, ForkLoveStatus } from "@marinara-engine/shared";
import type { Bond } from "../bonds/fork-bonds.js";

const KIND_LABELS: Record<ForkBondKind, string> = {
  love: "love interest",
  family: "family",
  friend: "friend",
  rival: "rival",
  ex: "ex",
  other: "knows each other",
};

const STATUS_LABELS: Record<ForkLoveStatus, string> = {
  talking: "talking, nothing said out loud yet",
  dating: "dating",
  together: "together",
  living: "living together",
  engaged: "engaged",
  married: "married",
};

/**
 * The fields the writer is shown. The rest (the memory, the date idea, the scene's turn) are for
 * the card and the agent; they would only tempt the writer to repeat them.
 */
const WRITER_FIELDS: Record<string, string> = {
  role: "Role",
  heart: "Heart",
  trust: "Trust",
  want: "Wants",
  guard: "Guard",
  wound: "Old wound",
  expects: "Expects",
  protects: "Protects",
  vibe: "Vibe",
  joke: "Inside joke",
  owed: "Owed",
  respect: "Respects",
  grudge: "Grudge",
  beat: "Competes over",
  weakness: "Spotted weakness",
  ended: "Why it ended",
  pull: "Still pulls",
  hurts: "Still hurts",
  likes: "Likes",
  dislikes: "Dislikes",
  tell: "Tell",
  unsaid: "Unsaid",
  next: "Would move them",
};

/** Long enough for a real detail, short enough that twenty people do not swamp the prompt. */
const MAX_FIELD_IN_PROMPT = 220;

function bondLines(bond: Bond, nameFor: (characterId: string) => string): string[] {
  const who = bond.label.trim() || nameFor(bond.characterId) || "Someone";
  const head = [
    KIND_LABELS[bond.kind],
    bond.status ? STATUS_LABELS[bond.status] : "",
    bond.route ? `route ${bond.route}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const weather = [bond.rung, bond.condition, bond.drift].filter(Boolean).join(" · ");
  const lines = [`- ${who} (${head}): ${weather}`];
  for (const [key, label] of Object.entries(WRITER_FIELDS)) {
    const value = bond.fields[key]?.replace(/\s+/g, " ").trim();
    if (value) lines.push(`  ${label}: ${value.slice(0, MAX_FIELD_IN_PROMPT)}`);
  }
  return lines;
}

/**
 * Where every bond stands, as a short block for the prompt. Empty when the chat tracks no bonds,
 * so a roleplay that never opens the tracker costs nothing.
 *
 * It is all words: a rung on a ladder, the bond's condition and drift, then what they feel, trust and
 * want, because a model writes "Guarded, cooling" far better than it writes against a number.
 */
export function bondsPromptBlock(
  allBonds: readonly Bond[],
  nameFor: (characterId: string) => string,
  personaName: string,
): string {
  if (allBonds.length === 0) return "";
  const who = personaName.trim() || "the user's character";
  return [
    `Where things stand between ${who} and the people in this story (keep their behaviour consistent with this):`,
    ...allBonds.flatMap((bond) => bondLines(bond, nameFor)),
  ].join("\n");
}
