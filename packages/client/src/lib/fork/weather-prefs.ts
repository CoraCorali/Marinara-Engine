// ──────────────────────────────────────────────
// Fork: the weather panel's choices, and what they do to the weather (see FORK.md)
// ──────────────────────────────────────────────
import { resolveWeatherRenderConfig, type WeatherParticle, type WeatherRenderConfig } from "../weather-renderer";

/** Weather you can pick by hand. Each is the line the story's tracker would have written for it. */
export const WEATHER_PICKS = [
  { id: "clear", emoji: "☀️", phrase: "clear sky" },
  { id: "drizzle", emoji: "🌦️", phrase: "drizzle" },
  { id: "rain", emoji: "🌧️", phrase: "rain" },
  { id: "downpour", emoji: "💧", phrase: "heavy rain" },
  { id: "storm", emoji: "⛈️", phrase: "thunderstorm" },
  { id: "snow", emoji: "🌨️", phrase: "snow" },
  { id: "blizzard", emoji: "❄️", phrase: "blizzard" },
  { id: "fog", emoji: "🌫️", phrase: "fog" },
  { id: "wind", emoji: "🍃", phrase: "windy" },
  { id: "autumn", emoji: "🍂", phrase: "breezy autumn day" },
  { id: "petals", emoji: "🌸", phrase: "cherry blossom petals" },
  { id: "aurora", emoji: "🌌", phrase: "aurora" },
  { id: "embers", emoji: "🔥", phrase: "embers" },
  { id: "sand", emoji: "🏜️", phrase: "sandstorm" },
] as const;
export type WeatherPickId = (typeof WEATHER_PICKS)[number]["id"];

export const WEATHER_TIMES = ["story", "dawn", "day", "dusk", "night"] as const;
export type WeatherTime = (typeof WEATHER_TIMES)[number];
const TIME_PHRASES: Record<Exclude<WeatherTime, "story">, string> = {
  dawn: "dawn",
  day: "noon",
  dusk: "dusk",
  night: "night",
};

/**
 * What a time pick writes into the story's world state. A clock time rather than "dusk", so the
 * tracker's time tile reads the way the story writes it and the sky lands where it should.
 */
export const WORLD_TIME_FOR: Record<Exclude<WeatherTime, "story">, string> = {
  dawn: "6:00 AM",
  day: "12:00 PM",
  dusk: "7:30 PM",
  night: "11:00 PM",
};

/** A pick's line as the world state shows it: "Thunderstorm", not "thunderstorm". */
export function worldWeatherFor(pick: WeatherPickId): string {
  const phrase = (WEATHER_PICKS.find((entry) => entry.id === pick) ?? WEATHER_PICKS[0]).phrase;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** The pick that draws the same as the story's weather line, so the panel can light up its chip. */
export function weatherPickFor(worldWeather: string | null | undefined): WeatherPickId | null {
  if (!worldWeather?.trim()) return null;
  const exact = WEATHER_PICKS.find((entry) => entry.phrase === worldWeather.trim().toLowerCase());
  if (exact) return exact.id;
  // Otherwise the pick that would be drawn the same way: "light rain and wind" lights up Rain.
  const signature = (line: string) => {
    const config = resolveWeatherRenderConfig(line, "noon");
    const extras = config.extras.map((layer) => layer.type).sort();
    return [config.count > 0 ? config.type : "", config.lightning, ...extras].join("|");
  };
  const drawn = signature(worldWeather);
  const same = WEATHER_PICKS.find((entry) => signature(entry.phrase) === drawn);
  if (same) return same.id;
  // Then by the main weather alone, so "rain and wind" still lights up Rain.
  const main = (line: string) => signature(line).split("|").slice(0, 2).join("|");
  const drawnMain = main(worldWeather);
  if (drawnMain.startsWith("|")) return null;
  return WEATHER_PICKS.find((entry) => main(entry.phrase) === drawnMain)?.id ?? null;
}

/** Which part of the day the story's time line falls in. */
export function timeOfDayFor(worldTime: string | null | undefined): Exclude<WeatherTime, "story"> | null {
  if (!worldTime?.trim()) return null;
  const hour = resolveWeatherRenderConfig(null, worldTime).hour;
  if (hour < 0) return null;
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

export interface WeatherPrefs {
  /** Follow the story's weather line, or use the pick below. */
  follow: boolean;
  pick: WeatherPickId;
  time: WeatherTime;
  /** Multipliers, 1 = as Marinara draws it. */
  amount: number;
  speed: number;
  size: number;
  opacity: number;
  brightness: number;
  /** A colour laid softly over the weather, or "" for none. */
  tint: string;
  /** Stars and the odd shooting star, whatever the time says. */
  stars: boolean;
  /** Aurora ribbons over whatever else is happening. */
  aurora: boolean;
  /** The sun and moon: where the hour puts them, hidden, or placed by hand. */
  celestial: "auto" | "hide" | "manual";
  /** 0 (left) to 1 (right), for "manual". */
  celestialX: number;
  /** A soft wash of light that follows the story's time of day. */
  light: boolean;
}

export const DEFAULT_WEATHER_PREFS: WeatherPrefs = {
  follow: true,
  pick: "rain",
  time: "story",
  amount: 1,
  speed: 1,
  size: 1,
  opacity: 1,
  brightness: 1,
  tint: "",
  stars: false,
  aurora: false,
  celestial: "auto",
  celestialX: 0.75,
  light: true,
};

/** The weather and time lines the renderer should read, after the panel has had its say. */
export function effectiveWeatherInput(
  prefs: WeatherPrefs,
  story: { weather: string | null; time: string | null },
): { weather: string | null; time: string | null } {
  const pick = WEATHER_PICKS.find((entry) => entry.id === prefs.pick) ?? WEATHER_PICKS[0];
  return {
    weather: prefs.follow ? story.weather : pick.phrase,
    time: prefs.time === "story" ? story.time : TIME_PHRASES[prefs.time],
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The renderer's config with the panel's sliders and switches applied. Amount scales every layer's
 * particle count (at least one particle stays while a layer exists, so a quiet setting is never an
 * accidental off switch); speed and size travel with the config to the draw loop. Opacity,
 * brightness and tint are applied to the canvas by the browser and do not appear here.
 */
export function applyWeatherTuning(config: WeatherRenderConfig, prefs: WeatherPrefs): WeatherRenderConfig {
  const amount = clamp(prefs.amount, 0.2, 2.5);
  const scaled = (count: number) => (count > 0 ? Math.max(1, Math.round(count * amount)) : 0);
  const extras = config.extras.map((layer) => ({ ...layer, count: scaled(layer.count) }));
  if (prefs.aurora && config.type !== "aurora" && !extras.some((layer) => layer.type === "aurora")) {
    extras.push({ type: "aurora" as WeatherParticle["type"], count: 6 });
  }
  return {
    ...config,
    count: scaled(config.count),
    extras,
    addStars: config.addStars || prefs.stars,
    shootingStars: prefs.stars,
    sizeScale: clamp(prefs.size, 0.4, 2.5),
    speedScale: clamp(prefs.speed, 0.3, 2.5),
    celestialX: prefs.celestial === "manual" ? clamp(prefs.celestialX, 0, 1) : null,
  };
}

/** How loud each sound should be for a config, 0 to 1. */
export interface WeatherSoundScene {
  rain: number;
  wind: number;
  thunder: boolean;
  crackle: boolean;
}

const RAIN_LEVELS: Partial<Record<WeatherParticle["type"], number>> = {
  drizzle: 0.25,
  rain: 0.5,
  hail: 0.6,
  downpour: 0.9,
};
const WIND_LEVELS: Partial<Record<WeatherParticle["type"], number>> = {
  gust: 0.5,
  blizzard: 0.85,
  sand: 0.7,
  snow: 0.15,
  flurry: 0.1,
};

/** The soundscape for what is on screen: rain for rain, wind for wind and snow, thunder for lightning. */
export function weatherSoundScene(config: WeatherRenderConfig, fireplace: boolean): WeatherSoundScene {
  const gusty = config.extras.some((layer) => layer.type === "gust");
  return {
    rain: RAIN_LEVELS[config.type] ?? 0,
    wind: Math.max(WIND_LEVELS[config.type] ?? 0, gusty ? 0.4 : 0),
    thunder: config.lightning,
    crackle: fireplace || config.type === "ember",
  };
}
