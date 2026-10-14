/**
 * Fork: rain is drawn in a handful of strokes rather than one per drop.
 *
 * Rain was the weather that dropped frames on Jules' phone, and the reason was in the draw loop:
 * every drop cost its own beginPath/stroke pair, so a thunderstorm spent 120 driver calls a frame
 * on a field of two-pixel lines. This pins the fix by counting the calls a fake canvas receives.
 */
import assert from "node:assert/strict";

const { createWeatherParticle, drawWeatherParticles, resolveWeatherRenderConfig } =
  await import("../../packages/client/src/lib/weather-renderer.js");

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
assert.equal(storm.type, "rain");
assert.equal(storm.count, 120, "the heaviest rain the app draws");

const heavy = recordingContext();
drawWeatherParticles(heavy.context as never, field("rain", storm.count));
assert.ok(heavy.calls.moveTo >= 1, "the drops were actually drawn");
assert.ok(heavy.calls.stroke <= 15, `120 drops should cost at most 15 strokes, not ${heavy.calls.stroke}`);
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

console.log("fork weather batching: ok");
