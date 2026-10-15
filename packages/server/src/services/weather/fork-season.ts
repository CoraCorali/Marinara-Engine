// Fork feature: the season where the story is (see FORK.md).
//
// The weather canvas used to read the season off the month, northern hemisphere only, so a story in
// Sydney got snow in December. One small model call per place and month says which season it is
// there; the answer is cached in the chat, so it is asked again only when the place or month changes.

export const FORK_SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type ForkSeason = (typeof FORK_SEASONS)[number];
/** "none": a place with no seasons to speak of (the tropics, a space station). */
export type ForkSeasonAnswer = ForkSeason | "none";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** The month a story date names, 1–12, or 0 when it names none ("Day 3 of the voyage"). */
export function storyMonth(date: string | null | undefined): number {
  const text = (date ?? "").toLowerCase();
  if (!text.trim()) return 0;
  const named = MONTHS.findIndex((month) => new RegExp(`\\b${month.slice(0, 3)}(${month.slice(3)})?\\b`).test(text));
  if (named >= 0) return named + 1;
  const iso = text.match(/\b\d{4}-(\d{1,2})-\d{1,2}\b/);
  if (iso) return Number(iso[1]) >= 1 && Number(iso[1]) <= 12 ? Number(iso[1]) : 0;
  const slashed = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.]\d{2,4}\b/);
  if (slashed) return Number(slashed[1]) >= 1 && Number(slashed[1]) <= 12 ? Number(slashed[1]) : 0;
  return 0;
}

/** What the cached answer is keyed on: the place and the month. Null when there is no month. */
export function seasonCacheKey(date: string | null | undefined, location: string | null | undefined): string | null {
  const month = storyMonth(date);
  if (!month) return null;
  return `${(location ?? "").toLowerCase().replace(/\s+/g, " ").trim()}|${month}`;
}

/** The old rule, used when there is no model or it fails: the month, northern hemisphere. */
export function northernSeason(month: number): ForkSeason | null {
  if (!month) return null;
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

export function buildSeasonMessages(date: string, location: string): { role: "system" | "user"; content: string }[] {
  // The whole question rides in the user turn: some gateways weaken or drop a system turn, and a
  // model then answers "what would you like me to do with this setting?" instead of a season.
  return [
    {
      role: "user",
      content: [
        'Which season is it at this place on this date in a story? Use the real climate of the place. In the northern hemisphere December to February is winter, March to May spring, June to August summer and September to November autumn; the southern hemisphere is the other way round. Answer "none" for places without seasons, such as the tropics or a spaceship. An invented or fantasy place is in the northern hemisphere unless its name clearly says otherwise.',
        "",
        `Date in the story: ${date}`,
        `Place: ${location || "(not given)"}`,
        "",
        'Reply with JSON only, nothing else: {"season": "spring" | "summer" | "autumn" | "winter" | "none"}',
      ].join("\n"),
    },
  ];
}

export function readSeasonAnswer(raw: string): ForkSeasonAnswer | null {
  const match = raw.match(/"season"\s*:\s*"(spring|summer|autumn|fall|winter|none)"/i);
  const word = (
    match?.[1] ??
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, "")
  ).toLowerCase();
  if (word === "fall") return "autumn";
  return (FORK_SEASONS as readonly string[]).includes(word) || word === "none" ? (word as ForkSeasonAnswer) : null;
}
