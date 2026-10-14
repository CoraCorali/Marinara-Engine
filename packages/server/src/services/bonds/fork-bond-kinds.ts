// Fork feature: typed relationships (see FORK.md).
//
// The point of the redesign: a friend is not a love interest with a lower score. Each kind of bond
// climbs its own ladder and tracks its own handful of things, so "patience" exists where it means
// something and nowhere else.

export const BOND_KINDS = ["love", "family", "friend", "rival", "work", "other"] as const;
export type BondKind = (typeof BOND_KINDS)[number];

export interface BondMeter {
  /** Stored key, never shown. */
  id: string;
  /** What it is called on screen. */
  label: string;
  /** What a high reading means, so the model reads the number the way the writer meant it. */
  high: string;
  /** What a low reading means. */
  low: string;
}

export interface BondKindShape {
  label: string;
  /** Lowest to highest. A bond sits on exactly one rung. */
  stages: readonly string[];
  meters: readonly BondMeter[];
}

export const BOND_SHAPES: Record<BondKind, BondKindShape> = {
  love: {
    label: "Love interest",
    stages: ["noticing", "talking", "dating", "together", "engaged", "married"],
    meters: [
      { id: "wanting", label: "wanting her", high: "cannot keep his hands off her", low: "cool, distracted" },
      { id: "trust", label: "trust", high: "tells her everything", low: "keeps things from her" },
      { id: "patience", label: "patience left", high: "lets things go", low: "one more thing and he snaps" },
    ],
  },
  family: {
    label: "Family",
    stages: ["estranged", "distant", "in touch", "close", "inseparable"],
    meters: [
      { id: "warmth", label: "warmth", high: "openly loving", low: "polite at best" },
      { id: "duty", label: "obligation", high: "drops everything when called", low: "feels no pull" },
      { id: "friction", label: "friction", high: "every visit is a fight", low: "easy company" },
    ],
  },
  friend: {
    label: "Friend",
    stages: ["acquaintance", "friendly", "friend", "close friend", "chosen family"],
    meters: [
      { id: "closeness", label: "closeness", high: "talks every day", low: "drifting apart" },
      { id: "trust", label: "trust", high: "knows the real story", low: "gets the edited version" },
      { id: "reliability", label: "shows up", high: "always there", low: "never around when it counts" },
    ],
  },
  rival: {
    label: "Rival",
    stages: ["wary", "needling", "rivals", "enemies", "feud"],
    meters: [
      { id: "respect", label: "respect", high: "takes her seriously", low: "thinks she is nothing" },
      { id: "hostility", label: "hostility", high: "out to hurt her", low: "mostly posturing" },
    ],
  },
  work: {
    label: "Work",
    stages: ["colleague", "trusted", "right hand"],
    meters: [
      { id: "respect", label: "respect", high: "defers to her judgement", low: "talks over her" },
      { id: "reliance", label: "reliance", high: "cannot do it without her", low: "barely notices her" },
    ],
  },
  other: {
    label: "Someone else",
    stages: ["known", "familiar", "important"],
    meters: [{ id: "closeness", label: "closeness", high: "part of her life", low: "a face she knows" }],
  },
};

export function normalizeBondKind(value: unknown): BondKind {
  return BOND_KINDS.includes(value as BondKind) ? (value as BondKind) : "other";
}

/** Keep a stage on its ladder: a bond that changes kind lands on the nearest rung, never off the end. */
export function clampStage(kind: BondKind, stage: unknown): number {
  const top = BOND_SHAPES[kind].stages.length - 1;
  const value = typeof stage === "number" && Number.isFinite(stage) ? Math.round(stage) : 0;
  return Math.min(top, Math.max(0, value));
}

/** Meters are 0–100, and only the ones this kind actually has are kept. */
export function clampMeters(kind: BondKind, meters: unknown): Record<string, number> {
  const source = (meters ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const meter of BOND_SHAPES[kind].meters) {
    const raw = source[meter.id];
    const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 50;
    out[meter.id] = Math.min(100, Math.max(0, value));
  }
  return out;
}

/** A reading in words, so the model is not left to interpret a bare number. */
export function describeMeter(meter: BondMeter, value: number): string {
  if (value >= 80) return `${meter.label}: very high (${meter.high})`;
  if (value >= 60) return `${meter.label}: high`;
  if (value >= 40) return `${meter.label}: middling`;
  if (value >= 20) return `${meter.label}: low`;
  return `${meter.label}: very low (${meter.low})`;
}
