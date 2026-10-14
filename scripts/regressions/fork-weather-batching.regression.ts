/**
 * Fork: rain is drawn in a handful of strokes rather than one per drop.
 *
 * Rain was the weather that dropped frames on Jules' phone, and the reason was in the draw loop:
 * every drop cost its own beginPath/stroke pair, so a thunderstorm spent 120 driver calls a frame
 * on a field of two-pixel lines. This pins the fix by counting the calls a fake canvas receives.
 */
import assert from "node:assert/strict";

const {
  createWeatherField,
  createWeatherParticle,
  drawWeatherParticles,
  parseWeatherSeason,
  resolveWeatherRenderConfig,
  stepWeatherParticles,
} = await import("../../packages/client/src/lib/weather-renderer.js");

/** A canvas that records what it was asked to do, and nothing else. */
function recordingContext() {
  const calls = { beginPath: 0, stroke: 0, fill: 0, moveTo: 0, lineTo: 0, arc: 0 };
  const context = {
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: "",
    fillStyle: "",
    beginPath: () => void (calls.beginPath += 1),
    stroke: () => void (calls.stroke += 1),
    fill: () => void (calls.fill += 1),
    moveTo: () => void (calls.moveTo += 1),
    lineTo: () => void (calls.lineTo += 1),
    arc: () => void (calls.arc += 1),
    ellipse: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    fillRect: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  return { context, calls };
}

const field = (type: string, count: number) =>
  Array.from({ length: count }, () => {
    const particle = createWeatherParticle(type as never, 390, 844, true);
    // Mid-life, so nothing is skipped for having faded in or out.
    particle.life = particle.maxLife / 2;
    return particle;
  });

// ── A thunderstorm is the worst case the app can produce ──
const storm = resolveWeatherRenderConfig("thunderstorm", "night");
assert.equal(storm.type, "downpour");
assert.equal(storm.lightning, true);
assert.equal(storm.count, 130, "the heaviest rain the app draws");

const heavy = recordingContext();
drawWeatherParticles(heavy.context as never, field("downpour", storm.count));
assert.ok(heavy.calls.moveTo >= 1, "the drops were actually drawn");
assert.ok(heavy.calls.stroke <= 15, `130 drops should cost at most 15 strokes, not ${heavy.calls.stroke}`);
assert.equal(heavy.calls.beginPath, heavy.calls.stroke, "every path opened is a path stroked");

// Every drop still reaches the canvas: batching changes the number of calls, not what is drawn.
assert.equal(heavy.calls.moveTo, heavy.calls.lineTo, "each drop is one line");
assert.ok(heavy.calls.moveTo <= storm.count, "no drop is drawn twice");

// ── The saving grows with the downpour rather than shrinking ──
const drizzle = recordingContext();
drawWeatherParticles(drizzle.context as never, field("rain", 20));
assert.ok(heavy.calls.stroke <= drizzle.calls.stroke + 6, "six times the drops must not mean six times the strokes");

// ── Other weather is untouched ──
const snow = recordingContext();
drawWeatherParticles(snow.context as never, field("snow", 40));
assert.ok(snow.calls.arc >= 1, "snow still draws as circles");
assert.equal(snow.calls.stroke, 0, "snow does not stroke");

// A mixed field draws both kinds.
const mixed = recordingContext();
drawWeatherParticles(mixed.context as never, [...field("rain", 60), ...field("snow", 10)]);
assert.ok(mixed.calls.arc >= 1 && mixed.calls.stroke >= 1);
assert.ok(mixed.calls.stroke <= 15);

// ── Nothing to draw costs nothing ──
const empty = recordingContext();
drawWeatherParticles(empty.context as never, []);
assert.equal(empty.calls.beginPath, 0);
assert.equal(empty.calls.stroke, 0);

// Drizzle, rain and downpour share the batch.
const allRain = recordingContext();
drawWeatherParticles(allRain.context as never, [
  ...field("drizzle", 40),
  ...field("rain", 40),
  ...field("downpour", 40),
]);
assert.ok(allRain.calls.stroke <= 15, "every kind of rain batches together");
assert.equal(allRain.calls.moveTo, 120);

// ── Which effect a weather line gets ──
const kind = (weather: string) => resolveWeatherRenderConfig(weather, null).type;
assert.equal(kind("Drizzle"), "drizzle");
assert.equal(kind("light rain"), "drizzle");
assert.equal(kind("Rain showers"), "rain");
assert.equal(kind("Heavy rain"), "downpour");
assert.equal(kind("Torrential downpour"), "downpour");
assert.equal(kind("Thunderstorm"), "downpour");
assert.equal(kind("Light snow"), "flurry");
assert.equal(kind("Snow flurries"), "flurry");
assert.equal(kind("Snowing"), "snow");
assert.equal(kind("Heavy snow"), "snow");
assert.ok(resolveWeatherRenderConfig("Heavy snow", null).count > resolveWeatherRenderConfig("Snowing", null).count);
assert.equal(kind("Blizzard"), "blizzard");
assert.equal(kind("Windy"), "gust");
// The old order got these wrong.
assert.equal(kind("Cold rain"), "rain", "cold rain is rain, not snow");
assert.equal(kind("Windy and rainy"), "rain", "wind is a layer over the rain, not instead of it");
assert.ok(resolveWeatherRenderConfig("Windy and rainy", null).extras.some((layer) => layer.type === "gust"));
assert.equal(kind("Dust storm"), "sand", "a dust storm is not a rainstorm");
assert.notEqual(kind("Flash flood warning"), "ash", "flash is not ash");
assert.equal(kind("Freezing"), "flurry");

// ── Seasons ──
assert.equal(parseWeatherSeason(null, "October 12th"), "autumn");
assert.equal(parseWeatherSeason(null, "Late fall, year 3"), "autumn");
assert.equal(parseWeatherSeason("Snowfall", null), null, "snowfall is not fall");
assert.equal(parseWeatherSeason(null, "Mon, Jan 4"), "winter");
assert.equal(parseWeatherSeason("A warm summer evening", null), "summer");
assert.equal(parseWeatherSeason(null, "Day 3 of the voyage"), null);
const autumnRain = resolveWeatherRenderConfig("Light rain", "afternoon", "October 2");
assert.ok(
  autumnRain.extras.some((layer) => layer.type === "autumn-leaf"),
  "autumn leaves in the rain",
);
const winterStorm = resolveWeatherRenderConfig("Blizzard", null, "January");
assert.equal(winterStorm.extras.length, 0, "a season never adds to a storm");
const springDay = resolveWeatherRenderConfig(null, "noon", "April 9");
assert.ok(
  springDay.extras.some((layer) => layer.type === "petal"),
  "no weather, but spring still shows",
);

// ── The shared field and step ──
const fieldConfig = resolveWeatherRenderConfig("Windy and rainy", "night", "October");
const particles = createWeatherField(fieldConfig, 390, 844);
const expected =
  fieldConfig.count +
  fieldConfig.extras.reduce((sum, layer) => sum + layer.count, 0) +
  (fieldConfig.addFireflies ? 10 : 0) +
  (fieldConfig.addStars ? 18 : 0);
assert.equal(particles.length, expected, "every layer is in the field");
for (let frame = 0; frame < 600; frame += 1) stepWeatherParticles(particles, 1, 390, 844);
assert.equal(particles.length, expected, "stepping respawns rather than drops particles");
assert.ok(
  particles.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  "nothing runs off to infinity",
);

console.log("fork weather batching: ok");
