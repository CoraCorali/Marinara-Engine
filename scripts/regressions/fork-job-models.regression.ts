// Fork: a model of its own for each side job. The saved value is read defensively, since it is
// written by a screen and read by jobs that run with no screen open.
import assert from "node:assert/strict";
import { FORK_JOBS, readForkJobModelsValue } from "../../packages/server/src/services/generation/fork-job-models.js";

const empty = readForkJobModelsValue(null);
assert.deepEqual(Object.keys(empty).sort(), [...FORK_JOBS].sort(), "every job is present");
assert.ok(
  FORK_JOBS.every((job) => empty[job] === ""),
  "nothing picked keeps each job's usual model",
);
assert.equal(readForkJobModelsValue('{"director":" conn-1 ","nope":"x"}').director, "conn-1", "ids are trimmed");
assert.equal(
  (readForkJobModelsValue('{"nope":"x"}') as Record<string, string>).nope,
  undefined,
  "unknown jobs are dropped",
);
assert.equal(readForkJobModelsValue({ phone: 7, chapters: "c" }).phone, "", "a non-string is no choice");
assert.equal(readForkJobModelsValue({ phone: 7, chapters: "c" }).chapters, "c");
assert.equal(readForkJobModelsValue("not json").season, "", "a broken value is no choice");
assert.equal(readForkJobModelsValue({ describe: "x".repeat(500) }).describe.length, 200, "ids are capped");
console.log("fork job models: ok");
