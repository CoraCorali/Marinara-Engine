/**
 * Fork: a SillyTavern V2 character_book keeps its entry settings under `extensions`; importing it
 * keeps them instead of falling back to defaults (before_char, depth 4, 100%, no recursion).
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-st-book-ext-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { getDB, closeDB } = await import("../../packages/server/src/db/connection.js");
const { createLorebooksStorage } = await import("../../packages/server/src/services/storage/lorebooks.storage.js");
const { importSTLorebook } = await import("../../packages/server/src/services/import/st-lorebook.importer.js");

const db = await getDB();
const result = (await importSTLorebook(
  {
    name: "Card book",
    entries: [
      {
        keys: ["Vee"],
        content: "Vee keeps the bakery keys.",
        comment: "Vee",
        enabled: true,
        position: "before_char",
        extensions: {
          position: 4,
          depth: 2,
          role: 1,
          probability: 50,
          useProbability: true,
          prevent_recursion: false,
          group: "people",
          sticky: 3,
        },
      },
    ],
  },
  db,
  { fallbackName: "Card book" },
)) as { lorebookId: string };
const [entry] = (await createLorebooksStorage(db).listEntries(result.lorebookId)) as Record<string, unknown>[];
assert.equal(entry!.position, 2, "the at-depth position from extensions wins over the V2 string");
assert.equal(entry!.depth, 2);
assert.equal(entry!.probability, 50);
assert.equal(entry!.preventRecursion, false);
assert.equal(entry!.group, "people");
assert.equal(entry!.sticky, 3);

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork st book extensions: ok");
