// Fork feature: preset regex packs (see FORK.md).
//
// A preset export carries the regex scripts assigned to that preset alone, so one file
// installs both. Re-importing the same preset replaces its pack instead of piling up copies.
import { isPatternSafe } from "@marinara-engine/shared";
import type { CreateRegexScriptInput, RegexPlacement } from "@marinara-engine/shared";

type ScriptRow = {
  name: string;
  enabled: string | null;
  findRegex: string;
  replaceString: string | null;
  trimStrings: string | null;
  placement: string | null;
  flags: string | null;
  promptOnly: string | null;
  applyMode: string | null;
  targetCharacterIds: string | null;
  targetPromptPresetIds: unknown;
  order: number;
  minDepth: number | null;
  maxDepth: number | null;
};

/** Stored placements are names; SillyTavern writes 1 for user input and 2 for AI output. */
function readPlacements(value: unknown): RegexPlacement[] {
  const out: RegexPlacement[] = [];
  for (const entry of parseJsonArray(value)) {
    const name =
      entry === "ai_output" || entry === 2 ? "ai_output" : entry === "user_input" || entry === 1 ? "user_input" : null;
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Scripts that belong to this preset alone, which is what a pack ships and replaces. */
export function isPackScript(script: { targetPromptPresetIds: unknown }, presetId: string): boolean {
  const ids = parseJsonArray(script.targetPromptPresetIds).filter((id): id is string => typeof id === "string");
  return ids.length === 1 && ids[0] === presetId;
}

/** The pack to put in a preset export: that preset's own scripts, without ids or timestamps. */
export function buildPresetRegexPack(scripts: readonly ScriptRow[], presetId: string): Record<string, unknown>[] {
  return scripts
    .filter((script) => isPackScript(script, presetId))
    .map((script) => ({
      name: script.name,
      enabled: script.enabled === "true",
      findRegex: script.findRegex,
      replaceString: script.replaceString ?? "",
      trimStrings: parseJsonArray(script.trimStrings),
      placement: readPlacements(script.placement),
      flags: script.flags ?? "gi",
      promptOnly: script.promptOnly === "true",
      applyMode: script.applyMode,
      targetCharacterIds: parseJsonArray(script.targetCharacterIds),
      order: script.order,
      minDepth: script.minDepth,
      maxDepth: script.maxDepth,
    }));
}

const APPLY_MODES = new Set(["prompt", "display", "both"]);

/**
 * Read a bundled pack into rows ready for storage, assigned to the given preset.
 * Accepts this fork's own shape and SillyTavern's (`scriptName`, `/source/flags`, `disabled`),
 * since preset files get passed around in both. Unsafe or uncompilable patterns are skipped
 * the same way Marinara skips them elsewhere.
 */
export function readPresetRegexPack(pack: unknown, presetId: string): CreateRegexScriptInput[] {
  if (!Array.isArray(pack)) return [];
  const out: CreateRegexScriptInput[] = [];
  for (const [index, entry] of pack.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const s = entry as Record<string, unknown>;
    const rawName = typeof s.name === "string" ? s.name : typeof s.scriptName === "string" ? s.scriptName : "";
    const rawFind = typeof s.findRegex === "string" ? s.findRegex.trim() : "";
    if (!rawFind) continue;
    // SillyTavern writes `/source/flags`; this fork's own export writes a bare source.
    const delimited = /^\/(.*)\/([a-z]*)$/is.exec(rawFind);
    const source = delimited ? delimited[1]! : rawFind;
    const flags = delimited
      ? Array.from(new Set(delimited[2]!.replace(/[^gimsuy]/g, ""))).join("")
      : typeof s.flags === "string"
        ? Array.from(new Set(s.flags.replace(/[^gimsuy]/g, ""))).join("")
        : "gi";
    if (!source || !isPatternSafe(source)) continue;
    try {
      new RegExp(source, flags);
    } catch {
      continue;
    }
    const placement = readPlacements(s.placement);
    if (placement.length === 0) continue;
    const promptOnly = s.promptOnly === true;
    const markdownOnly = s.markdownOnly === true;
    const applyMode =
      typeof s.applyMode === "string" && APPLY_MODES.has(s.applyMode)
        ? (s.applyMode as "prompt" | "display" | "both")
        : promptOnly && !markdownOnly
          ? "prompt"
          : markdownOnly && !promptOnly
            ? "display"
            : "both";
    out.push({
      name: rawName.trim() || "Imported regex",
      enabled: s.enabled === undefined ? s.disabled !== true : s.enabled !== false,
      findRegex: source,
      replaceString: typeof s.replaceString === "string" ? s.replaceString : "",
      trimStrings: parseJsonArray(s.trimStrings).filter((value): value is string => typeof value === "string"),
      placement,
      flags,
      promptOnly: applyMode === "prompt",
      applyMode,
      targetCharacterIds: [],
      targetPromptPresetIds: [presetId],
      order: typeof s.order === "number" && Number.isFinite(s.order) ? s.order : index,
      minDepth: typeof s.minDepth === "number" ? s.minDepth : null,
      maxDepth: typeof s.maxDepth === "number" ? s.maxDepth : null,
    });
  }
  return out;
}

/**
 * Toggle picks to keep when a preset is updated in place: the user's own choices for every
 * variable the new version still has, with the new version's defaults filling the rest.
 */
export function mergeDefaultChoices(
  existing: unknown,
  incoming: unknown,
  variableNames: readonly string[],
): Record<string, unknown> {
  const known = new Set(variableNames);
  const previous = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const next = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
  const merged: Record<string, unknown> = { ...(next as Record<string, unknown>) };
  for (const [key, value] of Object.entries(previous as Record<string, unknown>)) {
    if (known.has(key)) merged[key] = value;
  }
  return merged;
}
