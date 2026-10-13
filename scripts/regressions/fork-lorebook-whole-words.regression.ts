/**
 * Fork: new lorebook entries match whole words unless told otherwise, so a key like "ass"
 * no longer fires inside "class". Explicit choices (imports, the toggle) still win.
 */
import assert from "node:assert/strict";

const { createLorebookEntrySchema, updateLorebookEntrySchema } = await import("../../packages/shared/src/index.js");

const fresh = createLorebookEntrySchema.parse({ lorebookId: "book", name: "New Entry" });
assert.equal(fresh.matchWholeWords, true);

const explicit = createLorebookEntrySchema.parse({ lorebookId: "book", name: "Imported", matchWholeWords: false });
assert.equal(explicit.matchWholeWords, false);

// Saving other fields must not flip an existing entry's setting.
const update = updateLorebookEntrySchema.parse({ content: "new text" });
assert.equal("matchWholeWords" in update && update.matchWholeWords !== undefined, false);

console.log("fork lorebook whole-words default: ok");
