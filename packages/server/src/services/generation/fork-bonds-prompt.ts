// Fork feature: tell the model where each bond stands (see FORK.md).
import { BOND_METERS, type Bond, type BondKind, type LoveStage } from "../bonds/fork-bonds.js";

const KIND_LABELS: Record<BondKind, string> = {
  love: "Romantic",
  family: "Family",
  friend: "Friend",
  rival: "Rival",
  ex: "Ex",
  other: "Knows each other",
};

const STAGE_LABELS: Record<LoveStage, string> = {
  talking: "talking, nothing said out loud yet",
  dating: "dating",
  together: "together",
  living: "living together",
  engaged: "engaged",
  married: "married",
};

/** Meter names that need more than their storage key to read as English. */
const METER_PHRASES: Record<string, string> = { unfinished: "unfinished business" };

/** A meter in words, because a model reads "running thin" better than it reads 34. */
function meterWord(value: number): string {
  if (value >= 85) return "very high";
  if (value >= 65) return "high";
  if (value >= 40) return "middling";
  if (value >= 20) return "low";
  return "almost gone";
}

function bondLine(bond: Bond, nameFor: (characterId: string) => string): string {
  const [first, second] = BOND_METERS[bond.kind];
  const who = bond.label.trim() || nameFor(bond.characterId) || "Someone";
  const head = bond.stage ? `${KIND_LABELS[bond.kind]}, ${STAGE_LABELS[bond.stage]}` : KIND_LABELS[bond.kind];
  const meters = [
    `${METER_PHRASES[first] ?? first} ${meterWord(bond.first)}`,
    `${METER_PHRASES[second] ?? second} ${meterWord(bond.second)}`,
  ].join(", ");
  const note = bond.note.trim();
  return `- ${who}: ${head}. ${meters}.${note ? ` ${note}` : ""}`;
}

/**
 * Where every bond stands, as a short block for the prompt. Empty when the chat tracks no bonds,
 * so a roleplay that never opens the tracker costs nothing.
 *
 * Each kind names its own two meters, so the model is told "patience almost gone" rather than a
 * number against a word that means nothing for that kind of relationship.
 */
export function bondsPromptBlock(
  allBonds: readonly Bond[],
  nameFor: (characterId: string) => string,
  personaName: string,
): string {
  if (allBonds.length === 0) return "";
  const who = personaName.trim() || "the user's character";
  const lines = allBonds.map((bond) => bondLine(bond, nameFor));
  return [`Where things stand between ${who} and the people in this story:`, ...lines].join("\n");
}
