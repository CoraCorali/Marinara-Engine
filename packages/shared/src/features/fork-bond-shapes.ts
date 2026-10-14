// ──────────────────────────────────────────────
// Fork: the shape of each kind of relationship (see FORK.md)
// ──────────────────────────────────────────────
// A love interest follows Pura's dating-sim route: a warm ladder from Stranger to Devoted, a cold one
// from Wary to Nemesis, and tangled states that sit beside both. Every other kind has its own ladder
// and its own fields, so a sister is never asked what date she would say yes to.
//
// Everything is told in words, never in numbers. The server, the app and the regressions all read
// these lists, so a rung or a field exists in one place only.

export const FORK_BOND_KINDS = ["love", "family", "friend", "rival", "ex", "other"] as const;
export type ForkBondKind = (typeof FORK_BOND_KINDS)[number];

/** Where a romance has got to, separate from how they feel: a husband can still be Guarded. */
export const FORK_LOVE_STATUSES = ["talking", "dating", "together", "living", "engaged", "married"] as const;
export type ForkLoveStatus = (typeof FORK_LOVE_STATUSES)[number];

export interface ForkBondShape {
  /** Lowest rung first. The first ladder is the warm one a new bond starts on. */
  ladders: readonly (readonly string[])[];
  /** States beside the ladders rather than on them. */
  tangled: readonly string[];
  /** Detail fields, in card order. The first four are the coloured mini cards. */
  fields: readonly string[];
  /** Ladders where climbing means growing apart (the cold one, a rivalry heading for Nemesis). */
  awayLadders?: readonly number[];
}

export const FORK_BOND_SHAPES: Record<ForkBondKind, ForkBondShape> = {
  love: {
    ladders: [
      ["Stranger", "Noticed", "Acquaintance", "Familiar", "Friendly", "Close", "Confidant", "Intimate", "Devoted"],
      ["Wary", "Guarded", "Resentful", "Hostile", "Nemesis"],
    ],
    tangled: ["Complicated", "Codependent", "Estranged", "Rivals", "Frenemies", "Unrequited", "Forbidden"],
    awayLadders: [1],
    fields: [
      "heart",
      "trust",
      "want",
      "guard",
      "likes",
      "dislikes",
      "tell",
      "unsaid",
      "memory",
      "date",
      "turn",
      "next",
    ],
  },
  family: {
    ladders: [["Estranged", "Distant", "Dutiful", "Warm", "Close"]],
    tangled: ["Complicated", "Codependent"],
    fields: ["role", "heart", "wound", "expects", "protects", "tell", "unsaid", "memory", "turn", "next"],
  },
  friend: {
    ladders: [["Acquaintance", "Friendly", "Friend", "Close", "Ride-or-die"]],
    tangled: ["Complicated", "Frenemies"],
    fields: ["vibe", "trust", "joke", "owed", "tell", "unsaid", "memory", "hangout", "turn", "next"],
  },
  rival: {
    ladders: [["Annoyance", "Rival", "Nemesis"]],
    tangled: ["Grudging respect"],
    awayLadders: [0],
    fields: ["respect", "grudge", "beat", "weakness", "unsaid", "turn", "next"],
  },
  ex: {
    ladders: [["Bitter", "Distant", "Civil", "Unfinished", "Rekindling"]],
    tangled: ["Complicated"],
    fields: ["ended", "pull", "hurts", "unsaid", "memory", "turn", "next"],
  },
  other: {
    ladders: [["Stranger", "Noticed", "Acquaintance", "Familiar", "Friendly"]],
    tangled: ["Complicated"],
    fields: ["heart", "trust", "tell", "unsaid", "turn", "next"],
  },
};

/** What each field asks for, for the agent that fills it in. */
export const FORK_BOND_FIELD_GUIDE: Record<string, string> = {
  heart: "what they feel towards the user's character, shown as behaviour or inner voice",
  trust: "what they would trust the user's character with now, and what they still would not",
  want: "what they want from the user's character right now, spoken or unspoken",
  guard: "the fear, pride, loyalty or wound that holds them back",
  likes: "what the user's character has discovered wins them over (gifts, words, places, gestures)",
  dislikes: "what the user's character has discovered puts them off",
  tell: "one concrete, observable habit that betrays their current feeling",
  unsaid: "the sentence they are keeping to themselves, in their own voice",
  memory: "the shared moment they replay most, as a short title, a colon, then one line of detail",
  date: "the invitation they would say yes to right now, and where",
  turn: "the specific moment in this scene that moved them",
  next: "the exact kind of moment that would move them to the next rung",
  role: "who they are to the user's character (sister, dad, cousin)",
  wound: "the old hurt in the family that still shapes them",
  expects: "what they expect of the user's character",
  protects: "how they look out for the user's character",
  vibe: "the feel of the friendship, the way they are together",
  joke: "the inside joke or shorthand only the two of them get",
  owed: "favours owed either way",
  hangout: "the plan they would say yes to right now, and where",
  respect: "what they grudgingly respect about the user's character",
  grudge: "what they hold against the user's character",
  beat: "what they want to beat the user's character at",
  weakness: "the weakness they have spotted in the user's character",
  ended: "why it ended, in a line",
  pull: "what still pulls them back",
  hurts: "what still hurts",
};

export const FORK_BOND_CONDITIONS = [
  "💚 STABLE",
  "💛 SHIFTING",
  "💔 HEARTBROKEN",
  "🖤 BETRAYED",
  "💢 RESENTFUL",
  "🔥 PASSIONATE",
  "❄️ COLD",
  "🫧 INFATUATED",
  "💀 SEVERED",
  "🩹 MENDING",
  "⛓️ OBSESSED",
  "😶 NUMB",
  "🌧️ GRIEVING",
  "🤝 RECONCILING",
  "⚡ VOLATILE",
] as const;

export const FORK_BOND_DRIFTS = [
  "💗 HEART EVENT",
  "🥀 FALLING OUT",
  "🌅 WARMING",
  "🌫️ HOLDING",
  "🍂 COOLING",
  "🌊 CHURNING",
  "🪨 SETTLED",
] as const;

export const FORK_BOND_HEART_EVENT = "💗 HEART EVENT";
export const FORK_BOND_FALLING_OUT = "🥀 FALLING OUT";

export const FORK_BOND_ROUTE_EXAMPLES = [
  "🌱 Slow Burn",
  "🫂 Friends to Lovers",
  "⚔️ Rivals to Lovers",
  "🔥 Enemies to Lovers",
  "🌹 Forbidden Love",
  "🩹 Second Chance",
  "🌙 Secret Admirer",
  "🎭 Fake Dating",
  "🛡️ Bodyguard",
  "🤝 Found Family",
  "🕊️ Platonic Soulmates",
  "🥀 Tragic",
] as const;

/** Lower case and trimmed, so a model's "Love" or " married " still names the right thing. */
function token(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

/** A kind this tracker has, or null for anything else. */
export function readForkBondKind(value: unknown): ForkBondKind | null {
  const wanted = token(value);
  return FORK_BOND_KINDS.includes(wanted as ForkBondKind) ? (wanted as ForkBondKind) : null;
}

export function normalizeForkBondKind(value: unknown): ForkBondKind {
  return readForkBondKind(value) ?? "other";
}

/** A romance status as spelled, or null. */
export function readForkLoveStatus(value: unknown): ForkLoveStatus | null {
  const wanted = token(value);
  return FORK_LOVE_STATUSES.includes(wanted as ForkLoveStatus) ? (wanted as ForkLoveStatus) : null;
}

/** A romance's status, or null for every other kind. */
export function normalizeForkLoveStatus(kind: ForkBondKind, value: unknown): ForkLoveStatus | null {
  if (kind !== "love") return null;
  return readForkLoveStatus(value) ?? "talking";
}

/** Letters only, so "💛 shifting", "SHIFTING" and "Shifting!" are the same word. */
function wordKey(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function matchOption(options: readonly string[], value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = wordKey(value);
  return options.find((option) => wordKey(option) === key) ?? null;
}

export function forkBondRungs(kind: ForkBondKind): string[] {
  const shape = FORK_BOND_SHAPES[kind];
  return [...shape.ladders.flat(), ...shape.tangled];
}

export function defaultForkBondRung(kind: ForkBondKind): string {
  return FORK_BOND_SHAPES[kind].ladders[0]![0]!;
}

/** A rung this kind actually has, spelled the way the ladder spells it, or null. */
export function normalizeForkBondRung(kind: ForkBondKind, value: unknown): string | null {
  return matchOption(forkBondRungs(kind), value);
}

export function normalizeForkBondCondition(value: unknown): string | null {
  return matchOption(FORK_BOND_CONDITIONS, value);
}

export function normalizeForkBondDrift(value: unknown): string | null {
  return matchOption(FORK_BOND_DRIFTS, value);
}

/** Which ladder a rung is on and how high, or ladder -1 for a tangled state. */
export function forkBondRungPosition(kind: ForkBondKind, rung: string): { ladder: number; step: number } {
  const ladders = FORK_BOND_SHAPES[kind].ladders;
  for (let ladder = 0; ladder < ladders.length; ladder++) {
    const step = ladders[ladder]!.indexOf(rung);
    if (step >= 0) return { ladder, step };
  }
  return { ladder: -1, step: 0 };
}

/**
 * Where a bond lands when it is asked to move from one rung to another in one scene.
 *
 * On the same ladder it moves at most one rung. Onto another ladder it lands on that ladder's first
 * rung, so falling out with someone Devoted makes them Wary, not a Nemesis overnight. A tangled
 * state is a description rather than a height, so it can be named directly, and left the same way.
 */
export function stepForkBondRung(kind: ForkBondKind, current: string, wanted: string): string {
  if (wanted === current) return current;
  const ladders = FORK_BOND_SHAPES[kind].ladders;
  const from = forkBondRungPosition(kind, current);
  const to = forkBondRungPosition(kind, wanted);
  // A tangled state has no height, so moving into one, or out of one, lands where it is named.
  // Leaving "Complicated" for "Devoted" must not drop a marriage to the foot of the ladder.
  if (to.ladder === -1 || from.ladder === -1) return wanted;
  if (from.ladder === to.ladder) {
    const step = to.step > from.step ? from.step + 1 : from.step - 1;
    return ladders[to.ladder]![step]!;
  }
  return ladders[to.ladder]![0]!;
}

/**
 * +1 when a move is a step towards them, -1 when it is a step away, 0 when it is neither (a tangled
 * state). Moving onto a cold ladder is a falling out; the way back is warming, wherever it lands.
 */
export function forkBondRungDirection(kind: ForkBondKind, from: string, to: string): -1 | 0 | 1 {
  if (from === to) return 0;
  const a = forkBondRungPosition(kind, from);
  const b = forkBondRungPosition(kind, to);
  if (a.ladder === -1 || b.ladder === -1) return 0;
  const away = FORK_BOND_SHAPES[kind].awayLadders ?? [];
  if (a.ladder === b.ladder) {
    const climbing = b.step > a.step;
    // On the cold ladder, climbing towards Nemesis is moving away.
    return climbing !== away.includes(a.ladder) ? 1 : -1;
  }
  return away.includes(b.ladder) ? -1 : 1;
}

/** The rung below and the rung above, for the route progress pills. */
export function forkBondNeighbours(kind: ForkBondKind, rung: string): { below: string | null; above: string | null } {
  const position = forkBondRungPosition(kind, rung);
  if (position.ladder === -1) return { below: null, above: null };
  const ladder = FORK_BOND_SHAPES[kind].ladders[position.ladder]!;
  return { below: ladder[position.step - 1] ?? null, above: ladder[position.step + 1] ?? null };
}
