/**
 * Fork: importing a preset can update the one you already have instead of adding a copy,
 * and a preset carries its own regex scripts.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-preset-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { findPresetToUpdate } = await import("../../packages/client/src/lib/fork/preset-update.js");
const { buildPresetRegexPack, isPackScript, readPresetRegexPack, mergeDefaultChoices } =
  await import("../../packages/server/src/services/import/fork/preset-regex-pack.js");
const { getDB, closeDB } = await import("../../packages/server/src/db/connection.js");
const { createPromptsStorage } = await import("../../packages/server/src/services/storage/prompts.storage.js");
const { createRegexScriptsStorage } =
  await import("../../packages/server/src/services/storage/regex-scripts.storage.js");
const { importMarinara } = await import("../../packages/server/src/services/import/marinara.importer.js");

// ── Picking the preset to update ──
const presets = [
  { id: "a", name: "FF 5.4 Jules Custom" },
  { id: "b", name: "Something else" },
];
const envelope = (name: string, id?: string) => ({
  type: "marinara_preset",
  version: 1,
  data: { preset: { name, ...(id ? { id } : {}) } },
});
assert.equal(findPresetToUpdate(envelope("FF 5.4 Jules Custom"), presets)?.id, "a");
// Case and stray spaces should not stop a match.
assert.equal(findPresetToUpdate(envelope("  ff 5.4 jules custom "), presets)?.id, "a");
assert.equal(findPresetToUpdate(envelope(""), presets), null);
assert.equal(findPresetToUpdate(envelope("FF"), []), null);
// Two presets with the same name: no single obvious target, so add a copy.
assert.equal(
  findPresetToUpdate(envelope("Twin"), [
    { id: "a", name: "Twin" },
    { id: "b", name: "Twin" },
  ]),
  null,
);

// ── A bumped version is the same preset ──
// The real case: a preset carrying its version in its name, handed back a point release later.
const versioned = [
  { id: "a", name: "Freaky Frankenstein 5.4.8 \u2014 Jules Custom (AntiQuip + Pura/DEM/IHYLL/AA)" },
  { id: "b", name: "Something else" },
];
assert.equal(
  findPresetToUpdate(
    envelope("Freaky Frankenstein 5.4.9 \u2014 Jules Custom (AntiQuip + Pura/DEM/IHYLL/AA)"),
    versioned,
  )?.id,
  "a",
  "a point release updates the preset it replaces",
);
// An em dash swapped for a hyphen, or spacing changed, is still the same preset.
assert.equal(
  findPresetToUpdate(envelope("Freaky Frankenstein 5.5 - Jules Custom (AntiQuip + Pura/DEM/IHYLL/AA)"), versioned)?.id,
  "a",
);
// A genuinely different preset still does not match.
assert.equal(findPresetToUpdate(envelope("Freaky Frankenstein 5.4.9 \u2014 Default"), versioned), null);
// A bare number is not a version, so these stay apart.
assert.equal(
  findPresetToUpdate(envelope("Preset 3"), [
    { id: "a", name: "Preset 2" },
    { id: "b", name: "Preset 4" },
  ]),
  null,
  "a trailing number is part of the name, not a version",
);
// Two versions of the same preset already installed: no single obvious target.
assert.equal(
  findPresetToUpdate(envelope("FF 5.4.9 Jules"), [
    { id: "a", name: "FF 5.4.7 Jules" },
    { id: "b", name: "FF 5.4.8 Jules" },
  ]),
  null,
);

// ── An export knows which preset it came from ──
// The id in the file wins over the name, so a preset renamed since it was exported still updates.
assert.equal(findPresetToUpdate(envelope("Renamed entirely", "a"), presets)?.id, "a");
// An id from someone else's copy falls back to matching on the name.
assert.equal(findPresetToUpdate(envelope("FF 5.4 Jules Custom", "not-mine"), presets)?.id, "a");
assert.equal(findPresetToUpdate(envelope("Nothing like it", "not-mine"), presets), null);

// ── Reading a bundled pack ──
const pack = readPresetRegexPack(
  [
    { scriptName: "ST style", findRegex: "/foo(bar)/gi", placement: [2], replaceString: "$1", disabled: false },
    { name: "Fork style", findRegex: "baz", placement: ["user_input"], flags: "g", applyMode: "prompt" },
    { name: "Unsafe", findRegex: "(a+)+b", placement: [2] },
    { name: "No pattern", findRegex: "   ", placement: [2] },
    { name: "No placement", findRegex: "ok", placement: [] },
  ],
  "preset-1",
);
assert.equal(pack.length, 2, "unsafe, empty and placement-less scripts are skipped");
assert.deepEqual(pack[0]!.placement, ["ai_output"]);
assert.equal(pack[0]!.findRegex, "foo(bar)", "the /source/flags wrapper is unwrapped");
assert.deepEqual(pack[0]!.targetPromptPresetIds, ["preset-1"]);
assert.deepEqual(pack[1]!.placement, ["user_input"]);
assert.equal(pack[1]!.applyMode, "prompt");

// ── Which scripts belong to a preset's pack ──
assert.equal(isPackScript({ targetPromptPresetIds: JSON.stringify(["preset-1"]) }, "preset-1"), true);
assert.equal(
  isPackScript({ targetPromptPresetIds: ["preset-1", "preset-2"] }, "preset-1"),
  false,
  "shared scripts stay",
);
assert.equal(isPackScript({ targetPromptPresetIds: "[]" }, "preset-1"), false, "global scripts stay");

// ── Keeping toggle picks on update ──
assert.deepEqual(
  mergeDefaultChoices({ state_mode: "INTERNAL", gone: "x" }, { state_mode: "AGENTS", cot: "BOLT" }, [
    "state_mode",
    "cot",
  ]),
  { state_mode: "INTERNAL", cot: "BOLT" },
);

// ── End to end against real storage ──
const db = await getDB();
const prompts = createPromptsStorage(db);
const regex = createRegexScriptsStorage(db);

const file = (name: string, sectionName: string, choiceDefault: string) => ({
  type: "marinara_preset" as const,
  version: 1 as const,
  data: {
    preset: {
      id: "old-id",
      name,
      description: "",
      sectionOrder: JSON.stringify(["s1"]),
      groupOrder: "[]",
      defaultChoices: JSON.stringify({ cot: choiceDefault }),
    },
    sections: [{ id: "s1", name: sectionName, content: "body", enabled: "true" }],
    groups: [],
    choiceBlocks: [
      { variableName: "cot", question: "CoT", options: JSON.stringify([{ value: "BOLT" }, { value: "MAX" }]) },
    ],
    regexScripts: [{ name: "Pack script", findRegex: "hello", placement: ["ai_output"] }],
  },
});

const first = await importMarinara(file("My Preset", "First section", "BOLT") as never, db);
assert.equal(first.success, true);
assert.equal(first.updated, false, "a plain import is not an update");
assert.equal(first.regexInstalled, 1);
const presetId = first.id!;

// The user then changes a toggle and the preset's parameters.
await prompts.update(presetId, { defaultChoices: { cot: "MAX" }, parameters: { temperature: 0.42 } } as never);

const second = await importMarinara(file("My Preset", "Second section", "BOLT") as never, db);
assert.equal(second.success, true);
assert.equal(second.id !== presetId, true, "without replacePresetId an import still adds a copy");

const third = await importMarinara(
  { ...file("My Preset", "Third section", "BOLT"), replacePresetId: presetId } as never,
  db,
);
assert.equal(third.success, true);
assert.equal(third.updated, true);
assert.equal(third.id, presetId, "the updated preset keeps its id, so chats keep pointing at it");

const updated = await prompts.getById(presetId);
assert.equal(JSON.parse(updated!.parameters as string).temperature, 0.42, "generation parameters survive an update");
assert.equal(JSON.parse(updated!.defaultChoices as string).cot, "MAX", "the toggle the user picked survives");
const sections = await prompts.listSections(presetId);
assert.equal(sections.length, 1, "old sections are replaced, not stacked");
assert.equal(sections[0]!.name, "Third section");
assert.equal((await prompts.listChoiceBlocksForPreset(presetId)).length, 1, "choice blocks are replaced too");

const scripts = (await regex.list()).filter((script) => isPackScript(script, presetId));
assert.equal(scripts.length, 1, "the pack is replaced, not duplicated");
assert.equal(scripts[0]!.findRegex, "hello");

// A missing target is reported rather than silently creating a copy.
const orphan = await importMarinara({ ...file("My Preset", "x", "BOLT"), replacePresetId: "no-such-id" } as never, db);
assert.equal(orphan.success, false);

// ── Export carries the pack ──
const exported = buildPresetRegexPack(await regex.list(), presetId);
assert.equal(exported.length, 1);
assert.equal(exported[0]!.name, "Pack script");
assert.deepEqual(exported[0]!.placement, ["ai_output"]);

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork preset update + regex pack: ok");
