/**
 * Fork: reference board pins store, cap, and the prompt entries they turn into.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "marinara-fork-board-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { getDB, closeDB, registerForkTables } = await import("../../packages/server/src/db/connection.js");
const { boardPins, createBoardPinsStorage, MAX_BOARD_PINS_PER_SCOPE, normalizeCategory } =
  await import("../../packages/server/src/services/board/fork-board-pins.js");
const { boardPinsAsImageEntries } = await import("../../packages/server/src/services/generation/fork-board-prompt.js");

const db = await getDB();
registerForkTables([boardPins]);
const pins = createBoardPinsStorage(db);

// ── A chat's own pins ──
const dress = await pins.create({
  scopeType: "chat",
  scopeId: "chat-1",
  imagePath: "/api/lorebooks/entry-images/a.png",
  caption: "black satin slip dress",
  category: "wearing",
});
assert.ok(dress);
assert.equal(dress!.inScene, true, "a new pin is in scene by default");

const kitchen = await pins.create({
  scopeType: "chat",
  scopeId: "chat-1",
  imagePath: "/api/lorebooks/entry-images/b.png",
  caption: "his kitchen",
  category: "place",
});
assert.ok(kitchen);

// A nonsense category falls back rather than being stored as-is.
assert.equal(normalizeCategory("not-a-category"), "wearing");
const odd = await pins.create({
  scopeType: "chat",
  scopeId: "chat-1",
  imagePath: "/api/lorebooks/entry-images/c.png",
  category: "nonsense",
});
assert.equal(odd!.category, "wearing");

// ── Another chat's board is separate ──
await pins.create({ scopeType: "chat", scopeId: "chat-2", imagePath: "/api/lorebooks/entry-images/d.png" });
assert.equal((await pins.listForScope("chat", "chat-1")).length, 3);
assert.equal((await pins.listForScope("chat", "chat-2")).length, 1);

// ── Persona pins follow the persona ──
const ring = await pins.create({
  scopeType: "persona",
  scopeId: "persona-1",
  imagePath: "/api/lorebooks/entry-images/e.png",
  caption: "wedding ring",
  category: "thing",
});
assert.ok(ring);
// A persona scope and a chat scope never bleed into each other even with the same id.
await pins.create({ scopeType: "chat", scopeId: "persona-1", imagePath: "/api/lorebooks/entry-images/f.png" });
assert.equal((await pins.listForScope("persona", "persona-1")).length, 1);
assert.equal((await pins.listForScope("chat", "persona-1")).length, 1);

// ── What a reply carries ──
let prompt = await pins.listForPrompt("chat-1", "persona-1");
assert.equal(prompt.length, 4, "persona pins plus this chat's pins");
assert.equal(prompt[0]!.id, ring!.id, "persona pins come first");

// Taking a pin out of the scene keeps it on the board but off the prompt.
await pins.update(odd!.id, { inScene: false });
prompt = await pins.listForPrompt("chat-1", "persona-1");
assert.equal(prompt.length, 3);
assert.equal((await pins.listForScope("chat", "chat-1")).length, 3, "the pin is still on the board");

// With no persona, only the chat's pins go.
assert.equal((await pins.listForPrompt("chat-1", null)).length, 2);

// ── Captions and categories ──
await pins.update(dress!.id, { caption: "red slip dress", category: "vibe" });
const updated = await pins.getById(dress!.id);
assert.equal(updated!.caption, "red slip dress");
assert.equal(updated!.category, "vibe");

// ── Prompt entries ──
const entries = boardPinsAsImageEntries(await pins.listForPrompt("chat-1", "persona-1"));
assert.equal(entries.length, 3);
assert.equal(entries[0]!.name, "This thing (always on): wedding ring", "persona pins say they always apply");
assert.equal(entries[0]!.images[0]!.path, "/api/lorebooks/entry-images/e.png");
assert.equal(entries[0]!.position, 2, "pins use the same position as AI-output lorebook images");
assert.ok(
  entries.some((entry) => entry.name === "The mood: red slip dress"),
  "a chat pin reads as its category and caption",
);
// A pin with no caption still names its category.
const captionless = boardPinsAsImageEntries([
  {
    id: "x",
    scopeType: "chat",
    scopeId: "c",
    imagePath: "/p.png",
    caption: "  ",
    category: "place",
    inScene: true,
    order: 0,
  },
]);
assert.equal(captionless[0]!.name, "This place");

// ── Deleting ──
await pins.remove(kitchen!.id);
assert.equal(await pins.getById(kitchen!.id), null);
assert.equal((await pins.listForScope("chat", "chat-1")).length, 2);

// ── The board is capped ──
for (let index = 0; index < MAX_BOARD_PINS_PER_SCOPE; index += 1) {
  await pins.create({
    scopeType: "chat",
    scopeId: "chat-full",
    imagePath: `/api/lorebooks/entry-images/n${index}.png`,
  });
}
assert.equal((await pins.listForScope("chat", "chat-full")).length, MAX_BOARD_PINS_PER_SCOPE);
assert.equal(
  await pins.create({ scopeType: "chat", scopeId: "chat-full", imagePath: "/api/lorebooks/entry-images/over.png" }),
  null,
  "a full board refuses another pin instead of growing without limit",
);

// ── Deleting a chat or persona clears its board ──
const { removeForkBoardScope } = await import("../../packages/server/src/services/board/fork-board-cleanup.js");
assert.equal((await pins.listForScope("chat", "chat-2")).length, 1);
const cleared = await pins.removeScope("chat", "chat-2");
assert.deepEqual(cleared, ["/api/lorebooks/entry-images/d.png"], "the pictures to delete come back");
assert.equal((await pins.listForScope("chat", "chat-2")).length, 0);
// Other boards are untouched.
assert.equal((await pins.listForScope("persona", "persona-1")).length, 1);
// The cleanup wrapper tolerates a missing picture rather than blocking a delete.
await removeForkBoardScope(db, "persona", "persona-1");
assert.equal((await pins.listForScope("persona", "persona-1")).length, 0);
// Clearing a scope that has no board is harmless.
await removeForkBoardScope(db, "chat", "never-existed");

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork reference board: ok");
