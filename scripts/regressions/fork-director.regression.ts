/**
 * Fork: the Director's chair endpoint. Off-record talk that returns a reply plus the note the
 * chat can apply as a guided regeneration.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-director-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { buildGuidedGenerationInstructionMessage, stripGenerationGuideInstruction } =
  await import("../../packages/shared/src/index.js");

// The note becomes a guided instruction, which generation already understands, and reads back out.
const note = "He goes quiet, checks the truck, then snaps about the insurance. No hug.";
const instruction = buildGuidedGenerationInstructionMessage(note);
assert.ok(instruction.includes(note), "the note reaches the writer model");
assert.ok(instruction.includes("do not include a reply from {{user}}"), "the direction never speaks for the user");
assert.equal(stripGenerationGuideInstruction(instruction), note, "the note reads back out for display");

// A note with stray whitespace is trimmed rather than carried into the prompt.
assert.equal(stripGenerationGuideInstruction(buildGuidedGenerationInstructionMessage(`  ${note}  `)), note);

// ── The endpoint's own reply parsing ──
// The route asks for JSON but keeps the model's words when it answers in plain prose instead.
function readDirectorReply(raw: string): { say: string; note: string } {
  let say = raw.trim();
  let parsedNote = "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { say?: unknown; note?: unknown };
      if (typeof parsed.say === "string" && parsed.say.trim()) say = parsed.say.trim();
      if (typeof parsed.note === "string") parsedNote = parsed.note.trim();
    } catch {
      /* keep the raw text */
    }
  }
  return { say, note: parsedNote };
}

const clean = readDirectorReply('{"say":"Fair, his card says he is short-tempered.","note":"' + note + '"}');
assert.equal(clean.note, note);
assert.ok(clean.say.startsWith("Fair,"));

// Models often wrap JSON in prose or a code fence; both still parse.
const fenced = readDirectorReply('Sure!\n```json\n{"say":"Got it.","note":"Keep it short."}\n```');
assert.equal(fenced.say, "Got it.");
assert.equal(fenced.note, "Keep it short.");

// Plain prose with no JSON is still shown to the writer, with no note yet.
const prose = readDirectorReply("He would absolutely be annoyed about the truck.");
assert.equal(prose.say, "He would absolutely be annoyed about the truck.");
assert.equal(prose.note, "", "no note until something is decided");

// Broken JSON must not lose the model's answer.
const broken = readDirectorReply('{"say":"Half a thought"');
assert.ok(broken.say.includes("Half a thought"));

rmSync(dir, { recursive: true, force: true });
console.log("fork director: ok");
