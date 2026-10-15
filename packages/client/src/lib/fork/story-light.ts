// ──────────────────────────────────────────────
// Fork: the light follows the story's time (see FORK.md)
// ──────────────────────────────────────────────
import { forkStoryHour } from "@marinara-engine/shared";

export const STORY_LIGHT_PHASES = ["dawn", "day", "golden", "dusk", "night"] as const;
export type StoryLightPhase = (typeof STORY_LIGHT_PHASES)[number];

/** The phase of the day a story time falls in, or null when the time says nothing usable. */
export function storyLightPhase(time: string | null | undefined): StoryLightPhase | null {
  const text = (time ?? "").toLowerCase();
  if (!text.trim()) return null;
  const hour = forkStoryHour(text);
  if (hour >= 0) {
    if (hour >= 5 && hour < 8) return "dawn";
    if (hour >= 8 && hour < 16) return "day";
    if (hour >= 16 && hour < 18) return "golden";
    if (hour >= 18 && hour < 20) return "dusk";
    return "night";
  }
  // Words, when there is no clock: the most specific first.
  if (/golden hour|late afternoon/.test(text)) return "golden";
  if (/\b(dawn|sunrise|daybreak|early morning)\b/.test(text)) return "dawn";
  if (/\b(dusk|sunset|twilight|evening)\b/.test(text)) return "dusk";
  if (/\b(night|midnight|late)\b/.test(text)) return "night";
  if (/\b(morning|noon|midday|afternoon|day)\b/.test(text)) return "day";
  return null;
}

/**
 * The wash for each phase, laid over the background with soft-light so the theme's own colours
 * still lead. Day is nearly nothing; night adds a warm lamp glow in the bottom corner.
 */
export const STORY_LIGHT_WASH: Record<StoryLightPhase, string> = {
  dawn: "radial-gradient(120% 80% at 50% 110%, rgba(255,170,150,0.55), transparent 70%), linear-gradient(180deg, rgba(190,170,255,0.25), rgba(255,200,170,0.3))",
  day: "linear-gradient(180deg, rgba(255,250,235,0.18), rgba(255,245,225,0.08))",
  golden:
    "radial-gradient(120% 90% at 100% 20%, rgba(255,190,90,0.6), transparent 70%), linear-gradient(180deg, rgba(255,210,140,0.25), rgba(255,170,90,0.2))",
  dusk: "radial-gradient(130% 80% at 50% 105%, rgba(255,120,110,0.5), transparent 70%), linear-gradient(180deg, rgba(110,80,190,0.45), rgba(220,110,150,0.3))",
  night:
    "radial-gradient(60% 45% at 0% 100%, rgba(255,170,90,0.45), transparent 70%), linear-gradient(180deg, rgba(30,40,110,0.6), rgba(20,25,70,0.5))",
};
