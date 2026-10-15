/**
 * Fork: the light follows the story's time. A story time maps to one of five phases (dawn, day,
 * golden hour, dusk, night) by the clock, or by its words when there is no clock; no time, no wash.
 */
import assert from "node:assert/strict";

const { storyLightPhase, STORY_LIGHT_PHASES, STORY_LIGHT_WASH } =
  await import("../../packages/client/src/lib/fork/story-light.js");
const { DEFAULT_WEATHER_PREFS } = await import("../../packages/client/src/lib/fork/weather-prefs.js");

assert.equal(storyLightPhase("6:15 AM"), "dawn");
assert.equal(storyLightPhase("12:00 PM"), "day");
assert.equal(storyLightPhase("4:30 pm"), "golden");
assert.equal(storyLightPhase("18:45"), "dusk");
assert.equal(storyLightPhase("11:00 PM"), "night");
assert.equal(storyLightPhase("2:00 AM"), "night");
assert.equal(storyLightPhase("Golden hour"), "golden");
assert.equal(storyLightPhase("Late evening"), "dusk", "evening reads as dusk");
assert.equal(storyLightPhase("Just after sunrise"), "dawn");
assert.equal(storyLightPhase("Midnight"), "night");
assert.equal(storyLightPhase("Mid-morning"), "day");
assert.equal(storyLightPhase(""), null, "no time recorded, no wash");
assert.equal(storyLightPhase(null), null);
assert.equal(storyLightPhase("Unknown"), null);
for (const phase of STORY_LIGHT_PHASES) assert.ok(STORY_LIGHT_WASH[phase], `${phase} has a wash`);
assert.equal(DEFAULT_WEATHER_PREFS.light, true, "the light follows the story by default");
console.log("fork story light: ok");
