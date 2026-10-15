// ── Particle types ──
export interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  type:
    | "rain"
    | "snow"
    | "leaf"
    | "firefly"
    | "star"
    | "fog"
    | "dust"
    | "petal"
    | "ember"
    | "ash"
    | "sand"
    | "hail"
    | "aurora"
    // Fork: finer weather and the seasons.
    | "drizzle"
    | "downpour"
    | "flurry"
    | "blizzard"
    | "gust"
    | "autumn-leaf"
    | "pollen"
    // Fork: the weather panel's starry night.
    | "shooting-star";
  wobble: number;
  life: number;
  maxLife: number;
  /** Pre-computed fill colour (ash, sand) to avoid Math.random() in draw */
  color: string;
}

type WeatherCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Fork: a second layer over the main weather, such as gusts in the rain or the season's leaves. */
export interface WeatherLayer {
  type: WeatherParticle["type"];
  count: number;
}

export type WeatherSeason = "spring" | "summer" | "autumn" | "winter";

export interface WeatherRenderConfig {
  type: WeatherParticle["type"];
  count: number;
  overlay: string;
  lightning: boolean;
  /** Fork: extra layers drawn with the main weather. */
  extras: WeatherLayer[];
  season: WeatherSeason | null;
  tint: string;
  addFireflies: boolean;
  addStars: boolean;
  celestial: CelestialBody;
  hour: number;
  sunRays: boolean;
  sunsetGlow: boolean;
  isClearSky: boolean;
  /** Fork, weather panel: particle size multiplier (1 = as drawn). */
  sizeScale?: number;
  /** Fork, weather panel: simulation speed multiplier (1 = as drawn). */
  speedScale?: number;
  /** Fork, weather panel: a couple of shooting stars crossing the sky now and then. */
  shootingStars?: boolean;
  /** Fork, weather panel: the sun or moon's place across the sky, 0 to 1, instead of from the hour. */
  celestialX?: number | null;
}

// ── Map weather string → effect config ──
type WeatherEffect = {
  type: WeatherParticle["type"];
  count: number;
  overlay: string;
  lightning: boolean;
  extras: WeatherLayer[];
};

/** Fork: the falling-water and falling-snow types, for the checks that treat them alike. */
const WET_TYPES = new Set<WeatherParticle["type"]>(["rain", "drizzle", "downpour", "hail"]);
const SNOW_TYPES = new Set<WeatherParticle["type"]>(["snow", "flurry", "blizzard"]);

/**
 * Fork: which effect a tracker's weather line gets.
 *
 * Order matters, and the old order picked wrong: "cold rain" showed snow because cold was checked
 * before rain, "windy and rainy" showed leaves and no rain, "drizzle" and "showers" fell through to
 * nothing, and "flash flood" matched "ash". Precipitation is decided first, wind is a layer on top
 * of it rather than a replacement, and words match whole.
 */
function parseWeather(weather?: string | null): WeatherEffect {
  const none: WeatherEffect = { type: "dust", count: 0, overlay: "", lightning: false, extras: [] };
  if (!weather) return none;

  const w = weather.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(w);
  const windy = has(/\b(wind|windy|breez\w*|gust\w*|gale\w*)\b/);
  const gusts: WeatherLayer[] = windy ? [{ type: "gust", count: 8 }] : [];

  // Thunderstorm: heavy rain with lightning.
  if (has(/thunder|lightning/)) {
    return { type: "downpour", count: 130, overlay: "rgba(40,60,100,0.14)", lightning: true, extras: gusts };
  }
  if (has(/\bhail/)) {
    return { type: "hail", count: 40, overlay: "rgba(180,200,230,0.06)", lightning: false, extras: gusts };
  }
  // Before rain, since "dust storm" would otherwise read as a rainstorm.
  if (has(/sandstorm|\bsand\b|dust storm|sirocco/)) {
    return { type: "sand", count: 65, overlay: "rgba(180,150,100,0.12)", lightning: false, extras: [] };
  }
  // Snow, from a blizzard down to a few flakes.
  if (has(/blizzard|snowstorm|whiteout/) || (has(/snow/) && windy && has(/heavy/))) {
    return { type: "blizzard", count: 120, overlay: "rgba(210,225,255,0.12)", lightning: false, extras: [] };
  }
  if (has(/snow|sleet/) && has(/heavy|thick|deep|pouring|lots/)) {
    return { type: "snow", count: 90, overlay: "rgba(200,220,255,0.09)", lightning: false, extras: gusts };
  }
  if (has(/flurr|light snow|dusting|few flakes|snowflakes?/) || (has(/snow/) && has(/light|soft|gentle/))) {
    return { type: "flurry", count: 30, overlay: "rgba(200,220,255,0.04)", lightning: false, extras: gusts };
  }
  if (has(/snow|sleet/)) {
    return { type: "snow", count: 45, overlay: "rgba(200,220,255,0.06)", lightning: false, extras: gusts };
  }
  // Rain, from a drizzle up to a downpour.
  if (has(/drizzl|sprinkl|spitting|light rain|misty rain|fine rain/)) {
    return { type: "drizzle", count: 90, overlay: "rgba(60,80,110,0.05)", lightning: false, extras: gusts };
  }
  if (has(/downpour|pouring|torrential|heavy rain|lashing|sheets of rain|rainstorm|monsoon|\bstorm/)) {
    return {
      type: "downpour",
      count: 130,
      overlay: "rgba(40,60,100,0.12)",
      lightning: has(/\bstorm/),
      extras: gusts,
    };
  }
  if (has(/rain|shower|wet\b/)) {
    return { type: "rain", count: 60, overlay: "rgba(50,80,120,0.08)", lightning: false, extras: gusts };
  }
  if (has(/\bfog|mist|haze|hazy/)) {
    return { type: "fog", count: 12, overlay: "rgba(180,180,200,0.12)", lightning: false, extras: [] };
  }
  if (has(/\bash\b|ashfall|volcan|smok/)) {
    return { type: "ash", count: 30, overlay: "rgba(80,60,60,0.10)", lightning: false, extras: [] };
  }
  if (has(/\bembers?\b|wildfire|\bfire\b|inferno|burning/)) {
    return { type: "ember", count: 24, overlay: "rgba(120,40,10,0.08)", lightning: false, extras: [] };
  }
  if (has(/frost|\bcold\b|freez|icy|chill/)) {
    return { type: "flurry", count: 10, overlay: "rgba(180,210,240,0.06)", lightning: false, extras: gusts };
  }
  if (windy) {
    return { type: "gust", count: 14, overlay: "", lightning: false, extras: [{ type: "leaf", count: 8 }] };
  }
  if (has(/cherry|blossom|petal/)) {
    return { type: "petal", count: 22, overlay: "rgba(255,180,200,0.04)", lightning: false, extras: [] };
  }
  if (has(/aurora|northern light|polar light/)) {
    return { type: "aurora", count: 6, overlay: "rgba(20,60,40,0.08)", lightning: false, extras: [] };
  }
  if (has(/cloud|overcast|grey|gray/)) {
    return { type: "dust", count: 6, overlay: "rgba(100,100,120,0.05)", lightning: false, extras: [] };
  }
  return { type: "dust", count: 8, overlay: "", lightning: false, extras: [] };
}

const MONTH_SEASONS: Array<[RegExp, WeatherSeason]> = [
  [/\b(dec(ember)?|jan(uary)?|feb(ruary)?)\b/, "winter"],
  [/\b(mar(ch)?|apr(il)?|may)\b/, "spring"],
  [/\b(jun(e)?|jul(y)?|aug(ust)?)\b/, "summer"],
  [/\b(sep(t(ember)?)?|oct(ober)?|nov(ember)?)\b/, "autumn"],
];

/**
 * Fork: the season, from a season named in the weather or the date, or else from the date's month
 * (northern hemisphere). "Fall" only counts in the date, since a weather line says "snowfall" and
 * "nightfall". Null when nothing says.
 */
export function parseWeatherSeason(weather?: string | null, date?: string | null): WeatherSeason | null {
  const w = (weather ?? "").toLowerCase();
  const d = (date ?? "").toLowerCase();
  const named = `${w} ${d}`;
  if (/\bspring\b/.test(named) && !/\bspring (rain|shower)/.test(w)) return "spring";
  if (/\bsummer\b|midsummer/.test(named)) return "summer";
  if (/\bautumn\b/.test(named) || /\bfall\b/.test(d)) return "autumn";
  if (/\bwinter\b|midwinter/.test(named)) return "winter";
  for (const [pattern, season] of MONTH_SEASONS) {
    if (pattern.test(d)) return season;
  }
  return null;
}

/**
 * Fork: what a season adds over the weather. Quiet on purpose: a few petals, motes or leaves at
 * the edge of things, never on top of a storm, and winter only adds flakes when nothing else is
 * falling.
 */
function seasonLayers(season: WeatherSeason | null, base: WeatherParticle["type"]): WeatherLayer[] {
  if (!season) return [];
  const stormy = base === "downpour" || base === "blizzard" || base === "hail";
  const smothered = base === "sand" || base === "ash" || base === "ember" || base === "aurora";
  if (stormy || smothered) return [];
  const falling = WET_TYPES.has(base) || SNOW_TYPES.has(base);
  switch (season) {
    case "spring":
      return base === "petal" ? [] : [{ type: "petal", count: falling ? 4 : 10 }];
    case "summer":
      return falling ? [] : [{ type: "pollen", count: 14 }];
    case "autumn":
      return [{ type: "autumn-leaf", count: falling ? 5 : 12 }];
    case "winter":
      return falling ? [] : [{ type: "flurry", count: 14 }];
  }
}

// ── Map time of day → tint + fireflies ──
type CelestialBody = "sun" | "moon" | "none";

function isFalling(type?: WeatherParticle["type"]): boolean {
  return Boolean(type && (WET_TYPES.has(type) || SNOW_TYPES.has(type)));
}

function parseTime(
  timeOfDay?: string | null,
  baseType?: WeatherParticle["type"],
): {
  tint: string;
  addFireflies: boolean;
  addStars: boolean;
  celestial: CelestialBody;
  hour: number; // 0-24, -1 if unknown
  sunRays: boolean;
  sunsetGlow: boolean;
  isClearSky: boolean; // derived later; default false here
} {
  const base = {
    tint: "",
    addFireflies: false,
    addStars: false,
    celestial: "none" as CelestialBody,
    hour: -1,
    sunRays: false,
    sunsetGlow: false,
    isClearSky: false,
  };

  if (!timeOfDay) return base;

  const t = timeOfDay.toLowerCase();

  // Try to extract a numeric hour from the time string ("14:30", "2 PM", "1400", etc.)
  const hour = extractHour(t);
  base.hour = hour;

  if (t.includes("night") || t.includes("midnight")) {
    return {
      ...base,
      tint: "rgba(10,10,40,0.15)",
      addFireflies: !isFalling(baseType),
      addStars: baseType !== "fog" && !isFalling(baseType),
      celestial: "moon",
      hour: hour >= 0 ? hour : 0,
    };
  }
  if (t.includes("dusk") || t.includes("sunset") || t.includes("twilight") || t.includes("evening")) {
    return {
      ...base,
      tint: "rgba(80,30,20,0.10)",
      addFireflies: !isFalling(baseType),
      addStars: false,
      celestial: "sun",
      hour: hour >= 0 ? hour : 18,
      sunsetGlow: true,
    };
  }
  if (t.includes("dawn") || t.includes("sunrise") || t.includes("morning")) {
    return {
      ...base,
      tint: "rgba(120,80,40,0.06)",
      celestial: "sun",
      hour: hour >= 0 ? hour : 7,
      sunRays: true,
    };
  }

  // Numeric hour fallback — determine time period from hour
  if (hour >= 0) {
    if (hour >= 21 || hour < 5) {
      return {
        ...base,
        tint: "rgba(10,10,40,0.15)",
        addFireflies: !isFalling(baseType),
        addStars: baseType !== "fog" && !isFalling(baseType),
        celestial: "moon",
      };
    }
    if (hour >= 17 && hour < 21) {
      return {
        ...base,
        tint: "rgba(80,30,20,0.10)",
        addFireflies: !isFalling(baseType),
        celestial: "sun",
        sunsetGlow: hour >= 17,
      };
    }
    if (hour >= 5 && hour < 9) {
      return {
        ...base,
        tint: "rgba(120,80,40,0.06)",
        celestial: "sun",
        sunRays: true,
      };
    }
    // Daytime (9-17)
    return {
      ...base,
      celestial: "sun",
      sunRays: true,
    };
  }

  // If it just says "afternoon", "day", "noon", etc.
  if (t.includes("noon") || t.includes("midday") || t.includes("afternoon") || t.includes("day")) {
    return {
      ...base,
      celestial: "sun",
      hour: t.includes("afternoon") ? 15 : 12,
      sunRays: true,
    };
  }

  return base;
}

/** Try to extract an hour (0-23) from a time string. Returns -1 if not found. */
function extractHour(t: string): number {
  // "14:30", "2:00 PM", "14h30", "1400"
  const match24 = t.match(/\b(\d{1,2})[:.h](\d{2})\b/);
  if (match24) {
    let h = parseInt(match24[1]!, 10);
    if (t.includes("pm") && h < 12) h += 12;
    if (t.includes("am") && h === 12) h = 0;
    if (h >= 0 && h < 24) return h;
  }
  // "2 PM", "11 AM"
  const matchAmPm = t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (matchAmPm) {
    let h = parseInt(matchAmPm[1]!, 10);
    if (matchAmPm[2] === "pm" && h < 12) h += 12;
    if (matchAmPm[2] === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24) return h;
  }
  // Military "1400", "0800"
  const matchMil = t.match(/\b(\d{4})\s*(?:hours?|hrs?)?\b/);
  if (matchMil) {
    const h = parseInt(matchMil[1]!.slice(0, 2), 10);
    if (h >= 0 && h < 24) return h;
  }
  return -1;
}

export function resolveWeatherRenderConfig(
  weather?: string | null,
  timeOfDay?: string | null,
  date?: string | null,
  // Fork: the season where the story is, worked out by place (null for none); undefined reads the date.
  seasonHere?: WeatherSeason | null,
): WeatherRenderConfig {
  const weatherConfig = parseWeather(weather);
  const timeConfig = parseTime(timeOfDay, weatherConfig.type);
  // A season named in the weather line still wins ("autumn rain"); otherwise the place's answer.
  const named = parseWeatherSeason(weather, null);
  const season = named ?? (seasonHere === undefined ? parseWeatherSeason(weather, date) : seasonHere);
  const isClearSky =
    !weather ||
    /clear|sunny|bright/i.test(weather) ||
    !/(rain|storm|snow|blizzard|fog|mist|haze|hail|sand|ash|smoke|overcast|cloud|grey|gray|drizzl|shower|flurr|sleet|thunder)/i.test(
      weather,
    );
  return {
    ...weatherConfig,
    ...timeConfig,
    extras: [...weatherConfig.extras, ...seasonLayers(season, weatherConfig.type)],
    season,
    isClearSky,
  };
}

// ── Create particle ──
export function createWeatherParticle(
  type: WeatherParticle["type"],
  w: number,
  h: number,
  fromTop = false,
  sizeScale = 1,
): WeatherParticle {
  const base: WeatherParticle = {
    x: Math.random() * w,
    y: fromTop ? -10 : Math.random() * h,
    vx: 0,
    vy: 0,
    size: 2,
    opacity: 0.5,
    type,
    wobble: Math.random() * Math.PI * 2,
    life: 0,
    maxLife: 600 + Math.random() * 400,
    color: "",
  };

  switch (type) {
    case "rain":
      base.vy = 8 + Math.random() * 6;
      base.vx = -1 + Math.random() * -2;
      base.size = 1.5;
      base.opacity = 0.25 + Math.random() * 0.2;
      base.maxLife = 200;
      break;
    case "snow":
      base.vy = 0.5 + Math.random() * 1.2;
      base.vx = -0.3 + Math.random() * 0.6;
      base.size = 2 + Math.random() * 3;
      base.opacity = 0.4 + Math.random() * 0.3;
      base.maxLife = 800;
      break;
    case "leaf":
      base.vy = 0.8 + Math.random() * 1;
      base.vx = 1.5 + Math.random() * 2;
      base.size = 4 + Math.random() * 3;
      base.opacity = 0.5 + Math.random() * 0.3;
      base.maxLife = 500;
      break;
    case "petal":
      base.vy = 0.4 + Math.random() * 0.8;
      base.vx = 0.5 + Math.random() * 1;
      base.size = 3 + Math.random() * 3;
      base.opacity = 0.4 + Math.random() * 0.3;
      base.maxLife = 600;
      break;
    case "firefly":
      base.vy = -0.2 + Math.random() * 0.4;
      base.vx = -0.3 + Math.random() * 0.6;
      base.size = 2 + Math.random() * 2;
      // Fork: these were 0, and the draw step skips anything with no alpha, so no firefly or star
      // was ever drawn. Each one pulses or twinkles on its own; this is only its ceiling.
      base.opacity = 0.9;
      base.maxLife = 300 + Math.random() * 300;
      break;
    case "star":
      base.vy = 0;
      base.vx = 0;
      base.size = 1 + Math.random() * 1.5;
      base.opacity = 1;
      base.maxLife = 400 + Math.random() * 400;
      base.y = Math.random() * h * 0.4; // upper portion
      break;
    case "fog":
      base.vy = 0;
      base.vx = 0.2 + Math.random() * 0.4;
      base.size = 60 + Math.random() * 80;
      base.opacity = 0.03 + Math.random() * 0.04;
      base.maxLife = 1000;
      break;
    case "dust":
      base.vy = -0.1 + Math.random() * 0.2;
      base.vx = -0.1 + Math.random() * 0.2;
      base.size = 1 + Math.random() * 2;
      base.opacity = 0.15 + Math.random() * 0.15;
      base.maxLife = 600 + Math.random() * 400;
      break;
    case "ember":
      base.vy = -1.5 + Math.random() * -1.5;
      base.vx = -0.5 + Math.random() * 1;
      base.size = 2 + Math.random() * 2;
      base.opacity = 0.6 + Math.random() * 0.3;
      base.maxLife = 300 + Math.random() * 200;
      base.y = h + 10; // rise from bottom
      break;
    case "ash":
      base.vy = 0.3 + Math.random() * 0.6;
      base.vx = -0.4 + Math.random() * 0.8;
      base.size = 2 + Math.random() * 3;
      base.opacity = 0.2 + Math.random() * 0.2;
      base.maxLife = 700 + Math.random() * 300;
      base.color = `rgba(${(100 + Math.random() * 40) | 0},${(90 + Math.random() * 30) | 0},${(90 + Math.random() * 30) | 0},0.6)`;
      break;
    case "sand":
      base.vy = 0.5 + Math.random() * 1;
      base.vx = 4 + Math.random() * 4;
      base.size = 1 + Math.random() * 2;
      base.opacity = 0.3 + Math.random() * 0.3;
      base.maxLife = 250 + Math.random() * 150;
      base.x = -10; // enter from left
      base.color = `rgba(${(200 + Math.random() * 30) | 0},${(170 + Math.random() * 30) | 0},${(110 + Math.random() * 20) | 0},0.7)`;
      break;
    case "hail":
      base.vy = 10 + Math.random() * 6;
      base.vx = -1 + Math.random() * -1;
      base.size = 2 + Math.random() * 3;
      base.opacity = 0.4 + Math.random() * 0.3;
      base.maxLife = 150;
      break;
    // Fork: finer weather and the seasons.
    case "drizzle":
      base.vy = 4 + Math.random() * 2;
      base.vx = -0.4 + Math.random() * -0.6;
      base.size = 0.8;
      base.opacity = 0.14 + Math.random() * 0.12;
      base.maxLife = 260;
      break;
    case "downpour":
      base.vy = 15 + Math.random() * 6;
      base.vx = -3 + Math.random() * -2.5;
      base.size = 1.4 + Math.random() * 0.8;
      base.opacity = 0.3 + Math.random() * 0.2;
      base.maxLife = 120;
      break;
    case "flurry":
      base.vy = 0.3 + Math.random() * 0.5;
      base.vx = -0.2 + Math.random() * 0.4;
      base.size = 1 + Math.random() * 1.4;
      base.opacity = 0.35 + Math.random() * 0.25;
      base.maxLife = 900;
      break;
    case "blizzard":
      base.vy = 2 + Math.random() * 2.5;
      base.vx = 4 + Math.random() * 4;
      base.size = 1.4 + Math.random() * 2.2;
      base.opacity = 0.45 + Math.random() * 0.3;
      base.maxLife = 260;
      // Blown sideways faster than it falls, so a respawn comes in from the left edge as often as
      // the top; from the top alone, the lower half of a tall screen never saw any.
      if (fromTop && Math.random() < 0.5) {
        base.x = -10;
        base.y = Math.random() * h;
      }
      break;
    case "gust":
      base.vy = -0.2 + Math.random() * 0.4;
      base.vx = 9 + Math.random() * 7;
      base.size = 50 + Math.random() * 90; // streak length
      base.opacity = 0.16 + Math.random() * 0.16;
      base.maxLife = 160;
      base.x = fromTop ? -base.size : base.x;
      base.y = Math.random() * h;
      break;
    case "autumn-leaf":
      base.vy = 0.7 + Math.random() * 0.9;
      base.vx = 0.4 + Math.random() * 1.2;
      base.size = 4 + Math.random() * 3;
      base.opacity = 0.55 + Math.random() * 0.3;
      base.maxLife = 600;
      base.color = `hsl(${(12 + Math.random() * 30) | 0}, ${(65 + Math.random() * 20) | 0}%, ${(38 + Math.random() * 14) | 0}%)`;
      break;
    case "pollen":
      base.vy = -0.15 + Math.random() * 0.25;
      base.vx = 0.1 + Math.random() * 0.3;
      base.size = 1.3 + Math.random() * 1.8;
      base.opacity = 0.35 + Math.random() * 0.3;
      base.maxLife = 700 + Math.random() * 400;
      base.y = Math.random() * h; // drifts in place, so a respawn anywhere, not along the top edge
      break;
    case "aurora":
      base.vy = 0;
      base.vx = 0.1 + Math.random() * 0.2;
      base.size = 80 + Math.random() * 120;
      base.opacity = 0.04 + Math.random() * 0.03;
      base.maxLife = 1200 + Math.random() * 600;
      base.y = Math.random() * h * 0.35; // upper sky
      break;
    // Fork: a streak across the upper sky. It waits a while (negative life) before each crossing, so
    // two of them make an occasional event rather than a meteor shower.
    case "shooting-star":
      base.x = Math.random() * w * 0.6;
      base.y = Math.random() * h * 0.3;
      base.vx = 9 + Math.random() * 5;
      base.vy = 3 + Math.random() * 2;
      base.size = 60 + Math.random() * 60; // tail length
      base.opacity = 0.8;
      base.maxLife = 45 + Math.random() * 20;
      base.life = -(240 + Math.random() * 900);
      break;
  }

  if (sizeScale !== 1) base.size *= sizeScale;
  return base;
}

// ── Fork: one field and one step for both the worker and the main-thread fallback ──

const FIREFLY_COUNT = 10;
const STAR_COUNT = 18;

/** Types that drift sideways as they fall. A Set, because this is tested once per particle per frame. */
const DRIFTING_TYPES = new Set<WeatherParticle["type"]>([
  "snow",
  "flurry",
  "leaf",
  "autumn-leaf",
  "petal",
  "ash",
  "pollen",
]);

/** Every particle a config asks for: the weather, its extra layers, and the night's fireflies and stars. */
export function createWeatherField(config: WeatherRenderConfig, w: number, h: number): WeatherParticle[] {
  const particles: WeatherParticle[] = [];
  const sizeScale = config.sizeScale ?? 1;
  const add = (type: WeatherParticle["type"], count: number) => {
    for (let index = 0; index < count; index += 1) particles.push(createWeatherParticle(type, w, h, false, sizeScale));
  };
  add(config.type, config.count);
  for (const layer of config.extras ?? []) add(layer.type, layer.count);
  if (config.addFireflies) add("firefly", FIREFLY_COUNT);
  if (config.addStars) add("star", STAR_COUNT);
  if (config.shootingStars) add("shooting-star", 2);
  return particles;
}

/** Move every particle one step and respawn the ones that left the screen or ran out of life. */
export function stepWeatherParticles(
  particles: WeatherParticle[],
  frameScale: number,
  w: number,
  h: number,
  sizeScale = 1,
) {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const p = particles[index]!;
    p.life += frameScale;
    // A shooting star waiting for its turn holds still.
    if (p.life < 0) continue;
    p.x += p.vx * frameScale;
    p.y += p.vy * frameScale;
    if (DRIFTING_TYPES.has(p.type)) {
      p.wobble += 0.02 * frameScale;
      p.x += Math.sin(p.wobble) * 0.5 * frameScale;
    } else if (p.type === "blizzard") {
      p.wobble += 0.05 * frameScale;
      p.y += Math.sin(p.wobble) * 0.6 * frameScale;
    } else if (p.type === "gust") {
      p.wobble += 0.04 * frameScale;
    } else if (p.type === "ember") {
      p.wobble += 0.04 * frameScale;
      p.x += Math.sin(p.wobble) * 0.6 * frameScale;
    } else if (p.type === "firefly") {
      p.wobble += 0.03 * frameScale;
      p.x += Math.sin(p.wobble) * 0.8 * frameScale;
      p.y += Math.cos(p.wobble * 0.7) * 0.4 * frameScale;
    }
    // A gust is long, so it may be off the right edge only once its tail is too.
    const margin = p.type === "gust" ? p.size + 20 : 20;
    const offScreen = p.y > h + 20 || p.y < -20 || p.x > w + margin || p.x < -margin;
    if (offScreen || p.life > p.maxLife) particles[index] = createWeatherParticle(p.type, w, h, true, sizeScale);
  }
}

// ── Draw helpers ──

/** The visible alpha of a particle: zero once it has faded out or has not faded in yet. */
/**
 * Fork: fast weather fades in over a few frames instead of sixty. A downpour drop crosses a phone
 * screen in under a second, so a sixty-frame fade left it half-invisible for its whole fall.
 */
const QUICK_FADE_TYPES = new Set<WeatherParticle["type"]>(["drizzle", "downpour", "blizzard", "gust", "shooting-star"]);

function particleAlpha(p: WeatherParticle): number {
  const fadeIn = Math.min(p.life / (QUICK_FADE_TYPES.has(p.type) ? 8 : 60), 1);
  const fadeOut = Math.max(1 - p.life / p.maxLife, 0);
  return p.opacity * fadeIn * fadeOut;
}

/**
 * Rain, in a handful of strokes instead of one per drop.
 *
 * Every drop is the same colour and differs only in width and alpha, but a canvas cannot change
 * either mid-path, so each drop used to cost its own beginPath/stroke pair: 120 driver calls a
 * frame in a thunderstorm, which is why rain was the weather that dropped frames. Rounding width
 * and alpha into a few buckets lets every drop in a bucket share one path. The rounding is finer
 * than the eye can follow on a falling two-pixel line, and the number of strokes is now bounded by
 * the number of buckets rather than by the number of drops.
 */
const RAIN_ALPHA_STEPS = 5;
const RAIN_WIDTH_STEPS = 3;

function drawRainBatched(ctx: WeatherCanvasContext, drops: readonly WeatherParticle[]) {
  if (drops.length === 0) return;
  ctx.strokeStyle = "rgba(180,210,255,0.8)";
  // bucket key -> the drops in it, built fresh each frame because the drops move
  const buckets = new Map<number, WeatherParticle[]>();
  let minWidth = Infinity;
  let maxWidth = 0;
  for (const drop of drops) {
    if (drop.size < minWidth) minWidth = drop.size;
    if (drop.size > maxWidth) maxWidth = drop.size;
  }
  const widthSpan = Math.max(maxWidth - minWidth, 0.0001);
  for (const drop of drops) {
    const alpha = particleAlpha(drop);
    if (alpha <= 0) continue;
    const alphaStep = Math.min(RAIN_ALPHA_STEPS - 1, Math.max(0, Math.round(alpha * (RAIN_ALPHA_STEPS - 1))));
    const widthStep = Math.min(
      RAIN_WIDTH_STEPS - 1,
      Math.max(0, Math.round(((drop.size - minWidth) / widthSpan) * (RAIN_WIDTH_STEPS - 1))),
    );
    const key = alphaStep * RAIN_WIDTH_STEPS + widthStep;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(drop);
    else buckets.set(key, [drop]);
  }
  for (const [key, bucket] of buckets) {
    const alphaStep = Math.floor(key / RAIN_WIDTH_STEPS);
    const widthStep = key % RAIN_WIDTH_STEPS;
    ctx.globalAlpha = alphaStep / (RAIN_ALPHA_STEPS - 1);
    ctx.lineWidth = minWidth + (widthStep / (RAIN_WIDTH_STEPS - 1)) * widthSpan;
    ctx.beginPath();
    for (const drop of bucket) {
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.vx * 2, drop.y + drop.vy * 2);
    }
    ctx.stroke();
  }
}

/**
 * Draw a whole field of particles. Rain is batched; everything else is drawn one at a time,
 * because no other type shares a style closely enough for batching to pay.
 */
export function drawWeatherParticles(ctx: WeatherCanvasContext, particles: readonly WeatherParticle[]) {
  let rain: WeatherParticle[] | null = null;
  for (const particle of particles) {
    // Fork: drizzle and downpour are rain at other speeds, so they batch with it. Their streak
    // length already follows their speed.
    if (particle.type === "rain" || particle.type === "drizzle" || particle.type === "downpour") {
      (rain ??= []).push(particle);
      continue;
    }
    drawWeatherParticle(ctx, particle);
  }
  if (rain) drawRainBatched(ctx, rain);
}

export function drawWeatherParticle(ctx: WeatherCanvasContext, p: WeatherParticle) {
  const alpha = particleAlpha(p);
  if (alpha <= 0) return;

  ctx.globalAlpha = alpha;

  switch (p.type) {
    case "rain": {
      ctx.strokeStyle = "rgba(180,210,255,0.8)";
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2);
      ctx.stroke();
      break;
    }
    case "snow": {
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "leaf": {
      ctx.fillStyle = `hsl(${100 + Math.sin(p.wobble) * 30}, 60%, 45%)`;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.wobble);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "petal": {
      ctx.fillStyle = `hsl(${340 + Math.sin(p.wobble) * 15}, 80%, 80%)`;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.wobble);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "firefly": {
      const pulse = Math.sin(p.life * 0.05) * 0.5 + 0.5;
      ctx.globalAlpha = alpha * 0.28 * pulse;
      ctx.fillStyle = "rgba(180,255,80,0.7)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * (0.65 + pulse * 0.35);
      ctx.fillStyle = "rgba(220,255,130,0.95)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "shooting-star": {
      const tailX = p.x - (p.vx / Math.hypot(p.vx, p.vy)) * p.size;
      const tailY = p.y - (p.vy / Math.hypot(p.vx, p.vy)) * p.size;
      const gradient = ctx.createLinearGradient(p.x, p.y, tailX, tailY);
      gradient.addColorStop(0, "rgba(255,255,245,0.95)");
      gradient.addColorStop(1, "rgba(255,255,245,0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      break;
    }
    case "star": {
      const twinkle = Math.sin(p.life * 0.04 + p.wobble) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,255,240,${twinkle * 0.7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      // cross sparkle
      ctx.strokeStyle = `rgba(255,255,240,${twinkle * 0.3})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(p.x - p.size * 2, p.y);
      ctx.lineTo(p.x + p.size * 2, p.y);
      ctx.moveTo(p.x, p.y - p.size * 2);
      ctx.lineTo(p.x, p.y + p.size * 2);
      ctx.stroke();
      break;
    }
    case "fog": {
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = "rgba(200,200,220,0.08)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 1.5, p.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "dust": {
      ctx.fillStyle = "rgba(255,240,220,0.6)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "ember": {
      const emberPulse = Math.sin(p.life * 0.08) * 0.3 + 0.7;
      ctx.globalAlpha = alpha * 0.32 * emberPulse;
      ctx.fillStyle = "rgba(255,80,20,0.7)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * emberPulse;
      ctx.fillStyle = "rgba(255,205,70,0.92)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "ash": {
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.wobble);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "sand": {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "hail": {
      ctx.fillStyle = "rgba(230,240,255,0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    // Fork: finer weather and the seasons.
    case "drizzle":
    case "downpour": {
      ctx.strokeStyle = "rgba(180,210,255,0.8)";
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2);
      ctx.stroke();
      break;
    }
    case "flurry":
    case "blizzard": {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "gust": {
      // A faint curved streak of air, brighter at its leading end.
      const tailX = p.x - p.size;
      const bend = Math.sin(p.wobble) * 6;
      const streak = ctx.createLinearGradient(tailX, p.y, p.x, p.y);
      streak.addColorStop(0, "rgba(235,240,250,0)");
      streak.addColorStop(1, "rgba(235,240,250,0.9)");
      ctx.strokeStyle = streak;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tailX, p.y + bend);
      ctx.quadraticCurveTo(p.x - p.size * 0.5, p.y - bend, p.x, p.y);
      ctx.stroke();
      ctx.lineCap = "butt";
      break;
    }
    case "autumn-leaf": {
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.wobble);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "pollen": {
      const shimmer = Math.sin(p.life * 0.03 + p.wobble) * 0.3 + 0.7;
      ctx.globalAlpha = alpha * shimmer;
      ctx.fillStyle = "rgba(255,225,140,0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "aurora": {
      // Tall vertical ribbon of colour that sways gently
      const hue = (p.wobble * 60 + p.life * 0.3) % 360;
      const auroraGrad = ctx.createLinearGradient(p.x, p.y - p.size, p.x, p.y + p.size);
      auroraGrad.addColorStop(0, `hsla(${hue},80%,60%,0)`);
      auroraGrad.addColorStop(0.3, `hsla(${hue},80%,60%,0.08)`);
      auroraGrad.addColorStop(0.5, `hsla(${(hue + 40) % 360},70%,55%,0.12)`);
      auroraGrad.addColorStop(0.7, `hsla(${(hue + 80) % 360},80%,60%,0.08)`);
      auroraGrad.addColorStop(1, `hsla(${(hue + 80) % 360},80%,60%,0)`);
      ctx.fillStyle = auroraGrad;
      ctx.beginPath();
      const ribbonW = p.size * 0.6;
      const sway = Math.sin(p.life * 0.008 + p.wobble) * 30;
      ctx.moveTo(p.x + sway - ribbonW, p.y - p.size);
      ctx.quadraticCurveTo(p.x + sway * 0.5, p.y, p.x + sway + ribbonW, p.y + p.size);
      ctx.lineTo(p.x + sway - ribbonW, p.y + p.size);
      ctx.quadraticCurveTo(p.x + sway * 0.5, p.y, p.x + sway + ribbonW, p.y - p.size);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.globalAlpha = 1;
}

// ── Celestial drawing helpers ──

/** Get sun/moon X position based on hour. Maps 6:00→left edge, 12:00→center, 18:00→right edge. */
export function weatherCelestialX(hour: number, w: number): number {
  // Sun arc: 6h = 0%, 12h = 50%, 18h = 100% of width
  const t = Math.max(0, Math.min(1, (hour - 6) / 12));
  return w * 0.08 + t * w * 0.84; // 8%-92% of width
}

/** Get sun Y position — arc from bottom-ish up to top and back down. */
export function weatherCelestialY(hour: number, h: number, isMoon: boolean): number {
  if (isMoon) {
    // Moon arc: highest at midnight (hour 0/24), lower at 21h and 5h
    const t = hour >= 12 ? (hour - 21) / 7 : (hour + 3) / 7; // normalized 0-1
    const arc = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
    return h * 0.05 + (1 - arc) * h * 0.2;
  }
  // Sun: lowest at 6h/18h, highest at noon
  const t = Math.max(0, Math.min(1, (hour - 6) / 12));
  const arc = Math.sin(t * Math.PI); // 0 at edges, 1 at noon
  return h * 0.05 + (1 - arc) * h * 0.25; // 5%-30% from top
}

export function drawWeatherSun(
  ctx: WeatherCanvasContext,
  x: number,
  y: number,
  radius: number,
  w: number,
  h: number,
  sunRays: boolean,
  sunsetGlow: boolean,
  frameCount: number,
) {
  ctx.save();

  if (sunsetGlow) {
    // Warm gradient sky wash at bottom
    const glowGrad = ctx.createRadialGradient(x, y, radius, x, y + radius * 6, radius * 12);
    glowGrad.addColorStop(0, "rgba(255,140,50,0.12)");
    glowGrad.addColorStop(0.4, "rgba(255,80,30,0.06)");
    glowGrad.addColorStop(1, "rgba(255,40,20,0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // Outer glow
  const outerGlow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 4);
  outerGlow.addColorStop(0, sunsetGlow ? "rgba(255,120,40,0.15)" : "rgba(255,240,180,0.12)");
  outerGlow.addColorStop(0.5, sunsetGlow ? "rgba(255,80,20,0.05)" : "rgba(255,240,180,0.04)");
  outerGlow.addColorStop(1, "rgba(255,240,180,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
  ctx.fill();

  // Sun disc
  const discGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  if (sunsetGlow) {
    discGrad.addColorStop(0, "rgba(255,200,100,0.9)");
    discGrad.addColorStop(0.7, "rgba(255,120,40,0.7)");
    discGrad.addColorStop(1, "rgba(255,80,20,0.3)");
  } else {
    discGrad.addColorStop(0, "rgba(255,250,220,0.8)");
    discGrad.addColorStop(0.7, "rgba(255,240,180,0.5)");
    discGrad.addColorStop(1, "rgba(255,230,150,0.2)");
  }
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = discGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Animated light rays
  if (sunRays) {
    const rayCount = 12;
    const rotOffset = frameCount * 0.002;
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + rotOffset;
      const pulse = 0.8 + Math.sin(frameCount * 0.01 + i * 1.5) * 0.2;
      const rayLen = radius * (3.5 + pulse * 2);
      const spread = 0.08;
      ctx.fillStyle = sunsetGlow ? "rgba(255,160,60,0.5)" : "rgba(255,250,200,0.4)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle - spread) * rayLen, y + Math.sin(angle - spread) * rayLen);
      ctx.lineTo(x + Math.cos(angle + spread) * rayLen, y + Math.sin(angle + spread) * rayLen);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

export function drawWeatherMoon(ctx: WeatherCanvasContext, x: number, y: number, radius: number, _frameCount: number) {
  ctx.save();

  // Soft moonlight glow
  const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 5);
  glow.addColorStop(0, "rgba(180,200,255,0.10)");
  glow.addColorStop(0.4, "rgba(150,180,255,0.04)");
  glow.addColorStop(1, "rgba(150,180,255,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 5, 0, Math.PI * 2);
  ctx.fill();

  // Moon disc (bright side)
  const discGrad = ctx.createRadialGradient(x - radius * 0.15, y - radius * 0.15, 0, x, y, radius);
  discGrad.addColorStop(0, "rgba(230,235,255,0.85)");
  discGrad.addColorStop(0.8, "rgba(200,210,240,0.6)");
  discGrad.addColorStop(1, "rgba(180,190,220,0.3)");
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = discGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Crescent shadow (dark side) — offset circle to create crescent shape
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.arc(x + radius * 0.45, y - radius * 0.1, radius * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // Subtle crater hints
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "rgba(150,160,190,1)";
  ctx.beginPath();
  ctx.arc(x - radius * 0.25, y - radius * 0.15, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - radius * 0.4, y + radius * 0.25, radius * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - radius * 0.05, y + radius * 0.35, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
