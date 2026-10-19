import { readFileSync, writeFileSync } from "node:fs";
import { resolveMacros } from "../../packages/shared/src/utils/macro-engine.ts";
const [, , presetPath, model, outPath] = process.argv;
const d = JSON.parse(readFileSync(presetPath, "utf8")).data;
const choices = JSON.parse(d.preset.defaultChoices);
choices.your_model = model; if (process.env.OVR) Object.assign(choices, JSON.parse(process.env.OVR)); if (process.argv[5]) choices.tune = process.argv[5].split(",");
const vars: Record<string, string> = {};
for (const [k, v] of Object.entries(choices)) vars[k] = Array.isArray(v) ? (v as string[]).join(", ") : String(v);
const ctx: any = { user: "Kyli", char: "Elias Mercer", characters: ["Elias Mercer"], variables: vars };
const order: string[] = JSON.parse(d.preset.sectionOrder);
const byId = Object.fromEntries(d.sections.map((s: any) => [s.id, s]));
const groups = Object.fromEntries(d.groups.map((g: any) => [g.id, g.name]));
const pre: string[] = [], depth0: string[] = [];
for (const id of order) { const s = byId[id]; if (!s || s.enabled !== "true") continue;
  if (s.isMarker === "true" || !s.content) { pre.push(`\n[[MARKER: ${s.name}]]\n`); continue; }
  const out = resolveMacros(s.content, ctx).trim(); if (!out) continue;
  const block = `\n##### ${s.name} (${s.role}, ${s.injectionPosition}${s.injectionPosition==="depth"?" "+s.injectionDepth:""})\n${out}\n`;
  (s.injectionPosition === "depth" ? depth0 : pre).push(block); }
writeFileSync(outPath, pre.join("") + "\n\n=========== AFTER CHAT HISTORY (depth) ===========\n" + depth0.join(""));
console.log(outPath, (pre.join("")+depth0.join("")).length, "chars; leftover macros:", ((pre.join("")+depth0.join("")).match(/\{\{(?!user|char)[^}]*\}\}/g)||[]).slice(0,10));
