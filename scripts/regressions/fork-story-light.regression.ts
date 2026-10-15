/**
 * Fork: the light follows the story's time, in step with Marinara's own sky. At every hour, and
 * for word times, night lighting shows only while the weather draws the moon, golden hour and dusk
 * only while it draws the setting sun, and dawn and day only while the sun is up; the warm glow
 * sits where the sun is drawn (or where it was placed by hand); weather that hides the sun mutes
 * the glow to an even grey; no time, no wash.
 */
import assert from "node:assert/strict";

const { storySky, storyLightPhase, storyLightWash } = await import("../../packages/client/src/lib/fork/story-light.js");
const { resolveWeatherRenderConfig, weatherCelestialX } =
  await import("../../packages/client/src/lib/weather-renderer.js");
const { DEFAULT_WEATHER_PREFS } = await import("../../packages/client/src/lib/fork/weather-prefs.js");

// ── In step with the sky, hour by hour and for words ──
const clockTimes = Array.from({ length: 24 }, (_, hour) => `${((hour + 11) % 12) + 1}:30 ${hour < 12 ? "AM" : "PM"}`);
const wordTimes = [
  "Midnight",
  "Late at night",
  "Dusk",
  "Sunset",
  "Evening",
  "Dawn",
  "Early morning",
  "Mid-morning",
  "Noon",
  "Afternoon",
  "Golden hour",
];
for (const time of [...clockTimes, ...wordTimes]) {
  const sky = resolveWeatherRenderConfig("Clear", time);
  const phase = storyLightPhase(time);
  if (sky.celestial === "moon") assert.equal(phase, "night", `${time}: the moon is out, so night`);
  else if (sky.sunsetGlow) assert.ok(phase === "golden" || phase === "dusk", `${time}: a setting sun, not ${phase}`);
  else if (sky.celestial === "sun") {
    assert.ok(phase === "dawn" || phase === "day" || phase === "golden", `${time}: the sun is up, not ${phase}`);
  }
  if (phase === "night") assert.equal(sky.celestial, "moon", `${time}: night lighting only under the moon`);
}
assert.equal(storyLightPhase("8:30 PM"), "dusk", "the sun is still setting at half past eight");
assert.equal(storyLightPhase("9:30 PM"), "night");
assert.equal(storyLightPhase("5:30 PM"), "golden");
assert.equal(storyLightPhase("6:15 AM"), "dawn");
assert.equal(storyLightPhase("12:00 PM"), "day");
assert.equal(storyLightPhase("Mid-morning"), "dawn", "Marinara reads morning as sunrise, and so does the light");
assert.equal(storyLightPhase(""), null, "no time recorded, no wash");
assert.equal(storyLightPhase(null), null);
assert.equal(storyLightPhase("Unknown"), null);

// ── The glow sits where the sun is ──
const dawn = storySky("Clear", "6:30 AM")!;
const dawnHour = resolveWeatherRenderConfig("Clear", "6:30 AM").hour;
assert.ok(Math.abs(dawn.sunX - weatherCelestialX(dawnHour, 1)) < 0.001, "the dawn glow is where the sun is drawn");
assert.ok(dawn.sunX < 0.2, "the dawn sun is on the left");
assert.match(storyLightWash(dawn), new RegExp(`at ${Math.round(dawn.sunX * 100)}% ${Math.round(dawn.sunY * 100)}%`));
assert.ok(storySky("Sunny", "5:30 PM")!.sunX > 0.8, "the golden-hour sun is on the right");
assert.equal(storySky("Clear", "5:30 PM", 0.25)!.sunX, 0.25, "a sun placed by hand moves the glow with it");

// ── Weather that hides the sun mutes the glow ──
for (const weather of ["Heavy rain", "Thunderstorm", "Fog", "Overcast", "Snow"]) {
  const sky = storySky(weather, "5:30 PM")!;
  assert.equal(sky.clear, resolveWeatherRenderConfig(weather, "5:30 PM").isClearSky);
  assert.equal(sky.clear, false, `${weather} hides the sun`);
  assert.doesNotMatch(storyLightWash(sky), /radial-gradient/, `${weather}: no sunny glow`);
}
assert.match(
  storyLightWash(storySky("Thunderstorm", "11:00 PM")!),
  /radial-gradient\(60% 40% at 0% 100%/,
  "the lamp stays on indoors",
);
assert.equal(DEFAULT_WEATHER_PREFS.light, true, "the light follows the story by default");
console.log("fork story light: ok");
