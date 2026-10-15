/**
 * Fork: the season where the story is. The month comes from the story's date in any common shape;
 * the cache key is the place and month; the fallback is the month, northern hemisphere; the
 * model's answer is read strictly. The canvas takes a place's season over the month, and a season
 * named in the weather line still wins.
 */
import assert from "node:assert/strict";

const { storyMonth, seasonCacheKey, northernSeason, readSeasonAnswer, buildSeasonMessages } =
  await import("../../packages/server/src/services/weather/fork-season.js");
const { resolveWeatherRenderConfig } = await import("../../packages/client/src/lib/weather-renderer.js");

assert.equal(storyMonth("Tuesday, December 14"), 12);
assert.equal(storyMonth("14 Dec 2026"), 12);
assert.equal(storyMonth("2026-07-03"), 7);
assert.equal(storyMonth("03/22/2026"), 3);
assert.equal(storyMonth("Day 3 of the voyage"), 0);
assert.equal(storyMonth(""), 0);
assert.equal(storyMonth("A Mayday call"), 0, "a word containing a month name is not a month");
assert.equal(seasonCacheKey("December 14", " Sydney,  Bondi "), "sydney, bondi|12");
assert.equal(seasonCacheKey("", "Sydney"), null, "no date, nothing to ask");
assert.equal(northernSeason(12), "winter");
assert.equal(northernSeason(4), "spring");
assert.equal(northernSeason(7), "summer");
assert.equal(northernSeason(10), "autumn");
assert.equal(northernSeason(0), null);
assert.equal(readSeasonAnswer('{"season": "summer"}'), "summer");
assert.equal(readSeasonAnswer('Sure! {"season":"Fall"}'), "autumn");
assert.equal(readSeasonAnswer("none"), "none");
assert.equal(readSeasonAnswer("It is probably warm."), null);
assert.equal(buildSeasonMessages("December 14", "Sydney").length, 1, "the question rides in one user turn");
assert.match(buildSeasonMessages("December 14", "Sydney")[0]!.content, /Date in the story: December 14\nPlace: Sydney/);

// The canvas: the place's season beats the month; a season in the weather line beats both.
assert.equal(resolveWeatherRenderConfig("clear", "noon", "December 14").season, "winter", "no answer yet: the month");
assert.equal(resolveWeatherRenderConfig("clear", "noon", "December 14", "summer").season, "summer");
assert.equal(resolveWeatherRenderConfig("clear", "noon", "December 14", null).season, null, "no season here");
assert.equal(resolveWeatherRenderConfig("autumn drizzle", "noon", "December 14", "summer").season, "autumn");
console.log("fork season: ok");
