/**
 * Fork: the Spark button runs the chat's active Interactive Choices agent, never the official
 * CYOA agent (which already runs on its own cadence).
 */
import assert from "node:assert/strict";

const { findSparkAgentType } = await import("../../packages/client/src/lib/fork/spark-button.js");
const { normalizeAgentImportEntry } = await import("../../packages/client/src/lib/agent-transfer.js");

const spark = { type: "scene-spark", settings: JSON.stringify({ resultType: "cyoa_choices" }) };
const tracker = { type: "custom-tracker", settings: JSON.stringify({ resultType: "custom_tracker_update" }) };
const cyoa = { type: "cyoa", settings: JSON.stringify({ resultType: "cyoa_choices" }) };

assert.equal(findSparkAgentType(["scene-spark"], [spark, tracker]), "scene-spark");
// Settings also arrive as an object rather than a JSON string.
assert.equal(
  findSparkAgentType(["scene-spark"], [{ type: "scene-spark", settings: { resultType: "cyoa_choices" } }]),
  "scene-spark",
);
// The official CYOA agent is never the Spark target.
assert.equal(findSparkAgentType(["cyoa"], [cyoa]), null);
assert.equal(findSparkAgentType(["cyoa", "scene-spark"], [cyoa, spark]), "scene-spark");
// Agents that are installed but not active in this chat do not count.
assert.equal(findSparkAgentType(["custom-tracker"], [spark, tracker]), null);
assert.equal(findSparkAgentType([], [spark]), null);
assert.equal(findSparkAgentType(["scene-spark"], null), null);
// Broken settings must not throw.
assert.equal(findSparkAgentType(["broken"], [{ type: "broken", settings: "{not json" }]), null);

// An imported Scene Spark package keeps its choice result type, so the button finds it.
const packaged = JSON.parse(
  '{"kind":"marinara.agent","version":1,"config":{"type":"scene-spark","name":"Scene Spark","phase":"post_processing","resultType":"cyoa_choices","promptTemplate":"x","settings":{"resultType":"cyoa_choices"}}}',
);
const imported = normalizeAgentImportEntry(packaged);
assert.ok(imported, "packaged agent should import");
assert.equal(imported!.resultType, "cyoa_choices");
assert.equal(
  findSparkAgentType([imported!.type], [{ type: imported!.type, settings: imported!.settings }]),
  imported!.type,
);

console.log("fork spark button: ok");
