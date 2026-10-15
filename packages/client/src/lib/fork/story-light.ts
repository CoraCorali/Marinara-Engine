// ──────────────────────────────────────────────
// Fork: the light follows the story's time (see FORK.md)
// ──────────────────────────────────────────────
// It reads the sky exactly as Marinara's weather does, so the two never disagree: night lighting
// only while the moon is out, a warm glow placed behind the sun where the sun is drawn, and no
// sunny glow while the weather hides the sun.
import { forkStoryHour } from "@marinara-engine/shared";
import { resolveWeatherRenderConfig, weatherCelestialX, weatherCelestialY } from "../weather-renderer";

export const STORY_LIGHT_PHASES = ["dawn", "day", "golden", "dusk", "night"] as const;
export type StoryLightPhase = (typeof STORY_LIGHT_PHASES)[number];

/** Where Marinara's sky is: its phase, whether the sun can be seen, and where the sun sits. */
export type StorySky = {
  phase: StoryLightPhase;
  /** False under rain, storm, fog, cloud or snow: Marinara hides the sun and moon then. */
  clear: boolean;
  /** The sun's place on screen, 0 to 1 from the left and from the top. */
  sunX: number;
  sunY: number;
};

const DEFAULT_HOUR: Record<StoryLightPhase, number> = { dawn: 7, day: 12, golden: 17.5, dusk: 19, night: 0 };

/**
 * The sky for a weather line and a story time (the ones the weather is drawn from), or null when
 * the time says nothing usable. `sunX` follows a sun placed by hand in the weather panel.
 */
export function storySky(
  weather: string | null | undefined,
  time: string | null | undefined,
  sunPlacedAt: number | null = null,
): StorySky | null {
  const text = (time ?? "").toLowerCase();
  if (!text.trim()) return null;
  const sky = resolveWeatherRenderConfig(weather ?? null, time ?? null);
  const clock = forkStoryHour(text);
  let phase: StoryLightPhase | null = null;
  if (sky.celestial === "moon") phase = "night";
  else if (sky.sunsetGlow) phase = clock >= 0 && clock < 19 ? "golden" : "dusk";
  else if (sky.celestial === "sun") {
    // Marinara reads these words before the clock, and so does the light.
    if (/dawn|sunrise|morning/.test(text)) phase = "dawn";
    else if (/golden hour|late afternoon/.test(text)) phase = "golden";
    else phase = clock >= 5 && clock < 9 ? "dawn" : "day";
  } else if (/golden hour/.test(text)) phase = "golden";
  if (!phase) return null;
  const hour = sky.hour >= 0 ? sky.hour : DEFAULT_HOUR[phase];
  return {
    phase,
    clear: sky.isClearSky,
    sunX: sunPlacedAt ?? weatherCelestialX(hour, 1),
    sunY: weatherCelestialY(hour, 1, false),
  };
}

/** The phase alone, for a time with no weather. */
export function storyLightPhase(time: string | null | undefined): StoryLightPhase | null {
  return storySky(null, time)?.phase ?? null;
}

const at = (sky: StorySky) => `${Math.round(sky.sunX * 100)}% ${Math.round(sky.sunY * 100)}%`;

/**
 * The wash for a sky, laid over the background with soft-light so the theme's own colours still
 * lead. A clear sky glows from where the sun is; a covered one is a cool, even grey. Night keeps
 * a warm lamp in the corner either way: that light is indoors.
 */
export function storyLightWash(sky: StorySky): string {
  if (sky.phase === "night") {
    return "radial-gradient(60% 40% at 0% 100%, rgba(255,170,90,0.4), transparent 70%), linear-gradient(180deg, rgba(30,40,110,0.5), rgba(20,25,70,0.4))";
  }
  if (!sky.clear) {
    switch (sky.phase) {
      case "dawn":
        return "linear-gradient(180deg, rgba(150,160,195,0.22), rgba(175,170,190,0.12))";
      case "day":
        return "linear-gradient(180deg, rgba(165,175,195,0.18), rgba(165,175,195,0.08))";
      case "golden":
        return "linear-gradient(180deg, rgba(175,165,165,0.22), rgba(160,150,160,0.12))";
      case "dusk":
        return "linear-gradient(180deg, rgba(90,90,140,0.3), rgba(110,100,140,0.18))";
    }
  }
  switch (sky.phase) {
    case "dawn":
      return `radial-gradient(70% 55% at ${at(sky)}, rgba(255,175,140,0.55), transparent 70%), linear-gradient(180deg, rgba(190,170,255,0.1), rgba(255,200,170,0.08))`;
    case "day":
      return `radial-gradient(70% 50% at ${at(sky)}, rgba(255,248,225,0.22), transparent 70%), linear-gradient(180deg, rgba(255,250,235,0.08), rgba(255,245,225,0.03))`;
    case "golden":
      return `radial-gradient(80% 60% at ${at(sky)}, rgba(255,190,90,0.55), transparent 70%), linear-gradient(180deg, rgba(255,210,140,0.1), rgba(255,170,90,0.1))`;
    case "dusk":
      return `radial-gradient(80% 60% at ${at(sky)}, rgba(255,120,110,0.45), transparent 70%), linear-gradient(180deg, rgba(110,80,190,0.28), rgba(220,110,150,0.16))`;
  }
}
