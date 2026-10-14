/**
 * Fork: the weather panel. Picking the weather replaces the story's line, the sliders scale what
 * is drawn without switching anything off, the sky switches add stars, shooting stars and aurora,
 * and the soundscape follows what is on screen.
 */
import assert from "node:assert/strict";

const { createWeatherField, createWeatherParticle, resolveWeatherRenderConfig, stepWeatherParticles } =
  await import("../../packages/client/src/lib/weather-renderer.js");
const { DEFAULT_WEATHER_PREFS, applyWeatherTuning, effectiveWeatherInput, weatherSoundScene } =
  await import("../../packages/client/src/lib/fork/weather-prefs.js");

const story = { weather: "light drizzle", time: "9:40 PM" };

// ── Follow the story, or pick ──
assert.deepEqual(effectiveWeatherInput(DEFAULT_WEATHER_PREFS, story), story, "by default the story decides");
assert.deepEqual(
  effectiveWeatherInput({ ...DEFAULT_WEATHER_PREFS, follow: false, pick: "storm", time: "dawn" }, story),
  { weather: "thunderstorm", time: "dawn" },
);
assert.equal(
  effectiveWeatherInput({ ...DEFAULT_WEATHER_PREFS, time: "night" }, story).weather,
  "light drizzle",
  "a time pick leaves the story's weather alone",
);
// Every pick's phrase reads as the weather it names.
const picked = (pick: string) =>
  resolveWeatherRenderConfig(
    effectiveWeatherInput({ ...DEFAULT_WEATHER_PREFS, follow: false, pick } as never, story).weather,
    "noon",
  ).type;
assert.equal(picked("storm"), "downpour");
assert.equal(picked("blizzard"), "blizzard");
assert.equal(picked("drizzle"), "drizzle");
assert.equal(picked("petals"), "petal");
assert.equal(picked("sand"), "sand");

// ── Tuning ──
const base = resolveWeatherRenderConfig("windy rain", "noon");
assert.deepEqual(applyWeatherTuning(base, DEFAULT_WEATHER_PREFS).count, base.count, "untouched sliders change nothing");
const more = applyWeatherTuning(base, { ...DEFAULT_WEATHER_PREFS, amount: 2 });
assert.equal(more.count, base.count * 2);
assert.equal(more.extras[0]!.count, base.extras[0]!.count * 2, "extra layers scale too");
const least = applyWeatherTuning(base, { ...DEFAULT_WEATHER_PREFS, amount: 0 });
assert.ok(least.count >= 1, "the lowest amount is quiet, never an accidental off switch");
assert.equal(
  applyWeatherTuning(resolveWeatherRenderConfig(null, null), { ...DEFAULT_WEATHER_PREFS, amount: 2 }).count,
  0,
  "nothing stays nothing",
);
const sky = applyWeatherTuning(resolveWeatherRenderConfig("clear", "noon"), {
  ...DEFAULT_WEATHER_PREFS,
  stars: true,
  aurora: true,
  celestial: "manual",
  celestialX: 1.4,
  size: 9,
});
assert.equal(sky.addStars, true, "stars on request, even at noon");
assert.equal(sky.shootingStars, true);
assert.ok(sky.extras.some((layer) => layer.type === "aurora"));
assert.equal(sky.celestialX, 1, "a hand-placed sun stays on screen");
assert.equal(sky.sizeScale, 2.5, "sliders are clamped");
assert.equal(applyWeatherTuning(base, DEFAULT_WEATHER_PREFS).celestialX, null, "auto follows the hour");

// ── The field: sizes scale, shooting stars wait their turn ──
const field = createWeatherField(sky, 400, 800);
const shooting = field.filter((particle) => particle.type === "shooting-star");
assert.equal(shooting.length, 2);
assert.ok(
  shooting.every((particle) => particle.life < 0),
  "a shooting star waits before its first crossing",
);
const before = shooting.map((particle) => [particle.x, particle.y]);
stepWeatherParticles(field, 1, 400, 800, 2.5);
assert.deepEqual(
  shooting.map((particle) => [particle.x, particle.y]),
  before,
  "a waiting shooting star holds still",
);
const small = createWeatherParticle("snow", 400, 800, false, 1);
const large = createWeatherParticle("snow", 400, 800, false, 2);
assert.ok(large.size >= 4 && small.size <= 5, "size scales a particle at birth");
// Stars and fireflies were born with no opacity, and nothing without alpha is drawn.
assert.ok(createWeatherParticle("star", 400, 800, false).opacity > 0, "a star can be seen");
assert.ok(createWeatherParticle("firefly", 400, 800, false).opacity > 0, "a firefly can be seen");

// ── Sounds follow the weather ──
const scene = (weather: string, fireplace = false) =>
  weatherSoundScene(resolveWeatherRenderConfig(weather, "noon"), fireplace);
assert.ok(scene("heavy rain").rain > scene("drizzle").rain, "a downpour is louder than a drizzle");
assert.equal(scene("thunderstorm").thunder, true);
assert.ok(scene("windy").wind > 0 && scene("windy").rain === 0);
assert.ok(scene("rain and wind").wind > 0, "wind in the rain is heard as well as seen");
assert.equal(scene("clear").rain + scene("clear").wind, 0, "a clear sky is quiet");
assert.equal(scene("clear", true).crackle, true, "the fireplace switch crackles whatever the weather");
assert.equal(scene("embers").crackle, true);

console.log("fork weather panel: ok");
