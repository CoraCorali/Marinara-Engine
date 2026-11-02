/**
 * Fork: a regex pack import waits out the server's request limit instead of skipping the rest.
 */
import assert from "node:assert/strict";

const { ApiError } = await import("../../packages/client/src/lib/api-client.js");
const { retryWhenRateLimited, isRateLimited } = await import("../../packages/client/src/lib/fork/rate-limit-retry.js");

const noSleep = async () => {};
let calls = 0;
let waits = 0;
const result = await retryWhenRateLimited(
  async () => {
    calls += 1;
    if (calls < 3) throw new ApiError(429, "Too many requests", {});
    return "saved";
  },
  () => (waits += 1),
  noSleep,
);
assert.equal(result, "saved", "a rate-limited import is tried again until it lands");
assert.equal(calls, 3);
assert.equal(waits, 2, "the writer is told each time it waits");

await assert.rejects(
  retryWhenRateLimited(async () => Promise.reject(new ApiError(400, "Bad pattern", {})), undefined, noSleep),
  /Bad pattern/,
  "any other error fails at once, as before",
);
let forever = 0;
await assert.rejects(
  retryWhenRateLimited(
    async () => {
      forever += 1;
      throw new ApiError(429, "Too many requests", {});
    },
    undefined,
    noSleep,
  ),
  /Too many requests/,
  "it gives up after waiting out more than the server's one-minute window",
);
assert.equal(forever, 9);
assert.ok(isRateLimited(new ApiError(429, "x", {})) && !isRateLimited(new Error("429")));
console.log("fork regex import retry: ok");
