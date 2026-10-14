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
const { boardPinsAsImageEntries, boardPinsNoteLine } =
  await import("../../packages/server/src/services/generation/fork-board-prompt.js");

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
assert.equal(entries[0]!.name, "Thing (always on): wedding ring", "persona pins say they always apply");
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
    who: "",
    slot: "",
    shows: "model",
    order: 0,
    createdAt: "",
  },
]);
assert.equal(captionless[0]!.name, "Place");

// The captions also go as words, for providers that never see the pictures. No caption, no line.
const noteLine = boardPinsNoteLine(await pins.listForPrompt("chat-1", "persona-1"));
assert.ok(noteLine.startsWith("Pinned for reference in this scene"));
assert.ok(noteLine.includes("Anyone modelling the clothes is not the character"), "the body rule goes with the pins");
assert.ok(noteLine.includes("- The mood: red slip dress"));
assert.equal(boardPinsNoteLine([{ ...captionless[0]!, caption: " " } as never]), "");

// ── Who, slots, and one of each per person ──
const { forkMessageMentionsPin } = await import("../../packages/shared/src/features/fork-board-shapes.js");
const { pinNameResolver } = await import("../../packages/server/src/services/generation/fork-board-prompt.js");
const wear = (caption: string, slot: string, extra: Record<string, unknown> = {}) =>
  pins.create({
    scopeType: "chat",
    scopeId: "chat-wear",
    imagePath: `/w-${slot}.png`,
    caption,
    category: "wearing",
    who: "persona",
    slot,
    ...extra,
  });
const pinkSet = (await wear("pink zip hoodie, cream top, grey leggings, white fluffy boots", "outfit"))!;
const boots = (await wear("white fluffy boots", "shoes"))!;
const hair = (await wear("blonde spiral curls in a high updo", "hair"))!;
assert.equal((await pins.getById(pinkSet.id))!.inScene, true, "pieces sit on top of an outfit");
const navy = (await wear("navy pinstripe shirt, black pencil skirt, black Mary Janes", "outfit", {
  shows: "clothes",
}))!;
assert.equal((await pins.getById(pinkSet.id))!.inScene, false, "a new outfit takes the old one out of the scene");
assert.equal((await pins.getById(boots.id))!.inScene, true, "but not the shoes");
assert.equal((await pins.getById(hair.id))!.inScene, true);
await wear("black ballet flats", "shoes");
assert.equal((await pins.getById(boots.id))!.inScene, false, "new shoes replace old shoes");
const vee = (await pins.create({
  scopeType: "chat",
  scopeId: "chat-wear",
  imagePath: "/v.png",
  caption: "black tee, jeans",
  category: "wearing",
  who: "char-vee",
  slot: "outfit",
}))!;
assert.equal((await pins.getById(navy.id))!.inScene, true, "someone else's outfit replaces nothing of yours");
await pins.update(pinkSet.id, { inScene: true });
assert.equal((await pins.getById(navy.id))!.inScene, false, "putting an outfit back in swaps it in");
assert.equal((await pins.getById(vee.id))!.inScene, true);

const names = pinNameResolver("Kyli", (id) => (id === "char-vee" ? "Vee" : ""));
const wornNote = boardPinsNoteLine(await pins.listForPrompt("chat-wear", null), names);
assert.ok(wornNote.includes("- Kyli is wearing (Full outfit): pink zip hoodie"), wornNote);
assert.ok(wornNote.includes("- Kyli's hair: blonde spiral curls"));
assert.ok(wornNote.includes("- Vee is wearing (Full outfit): black tee, jeans"));
assert.ok(!wornNote.includes("navy pinstripe"), "an outfit out of the scene is not mentioned");
// A chat outfit covers the persona board's always-on one, so the writer never hears of two.
const alwaysOn = (await pins.create({
  scopeType: "persona",
  scopeId: "persona-wear",
  imagePath: "/always.png",
  caption: "grey sweats",
  category: "wearing",
  who: "persona",
  slot: "outfit",
}))!;
const withPersona = await pins.listForPrompt("chat-wear", "persona-wear");
assert.ok(!withPersona.some((pin) => pin.id === alwaysOn.id), "the chat's outfit covers the always-on one");
assert.equal((await pins.getById(alwaysOn.id))!.inScene, true, "and the persona board is left as it was");
const flatLay = boardPinsAsImageEntries([{ ...navy, inScene: true }], names);
assert.ok(flatLay[0]!.name.includes("just the clothes, no one wearing them"), "a flat-lay says there is no model");

// ── A message that mentions a pin sends it along ──
assert.equal(forkMessageMentionsPin("She pulls on her fluffy boots and goes.", boots.caption), true);
assert.equal(forkMessageMentionsPin("She's wearing the blue sundress she likes", "blue sundress"), true);
assert.equal(
  forkMessageMentionsPin("She grabs her dress.", "yellow halter maxi dress"),
  false,
  "one shared word is not enough",
);
assert.equal(forkMessageMentionsPin("Mira waves.", "Mira"), true, "a one-word caption matches as a whole word");
assert.equal(
  forkMessageMentionsPin("She's in the dress with lace tonight.", "dress with lace"),
  true,
  "a caption with a small word in the middle still matches when typed out",
);
assert.equal(forkMessageMentionsPin("Admiral waves.", "Mira"), false);
const mentioned = await pins.listMentioned("chat-wear", null, "She changes into the navy pinstripe shirt for work.");
assert.deepEqual(
  mentioned.map((pin) => pin.id),
  [navy.id],
  "only pins out of the scene ride along on a mention",
);
assert.ok(
  boardPinsAsImageEntries(mentioned, names, new Set([navy.id]))[0]!.heading!.includes(
    "mentioned in the latest message",
  ),
);

const { pinsForReply } = await import("../../packages/server/src/services/generation/fork-board-prompt.js");
const forReply = pinsForReply(await pins.listForPrompt("chat-wear", null), mentioned);
assert.ok(
  forReply.some((pin) => pin.id === navy.id),
  "the mentioned outfit goes",
);
assert.ok(!forReply.some((pin) => pin.id === pinkSet.id), "and stands in for the outfit it replaces, for this reply");
assert.ok(
  forReply.some((pin) => pin.id === hair.id),
  "while the hair stays",
);
assert.equal((await pins.getById(pinkSet.id))!.inScene, true, "the board itself is unchanged");

// ── Describe it, and the tracker's Wearing line ──
const { readPinDescription, PIN_DESCRIBE_PROMPT } =
  await import("../../packages/server/src/services/generation/fork-pin-describe.js");
const { outfitLineFromPins, outfitStillMatches } = await import("../../packages/client/src/lib/fork/outfit.js");
assert.ok(PIN_DESCRIBE_PROMPT.includes("Never describe the person's body"), "describing never reads the model's body");
assert.deepEqual(
  readPinDescription(
    'Sure! {"caption": " navy pinstripe shirt,  black pencil skirt ", "category": "wearing", "slot": "outfit", "shows": "clothes"}',
  ),
  { caption: "navy pinstripe shirt, black pencil skirt", category: "wearing", slot: "outfit", shows: "clothes" },
);
assert.deepEqual(
  readPinDescription('{"caption": "the bakery at night", "category": "place", "slot": "shoes"}'),
  {
    caption: "the bakery at night",
    category: "place",
    slot: "",
    shows: "model",
  },
  "only wearing pins keep a slot",
);
assert.equal(readPinDescription("I can't see images."), null);
assert.equal(readPinDescription('{"caption": ""}'), null);
const worn = [
  { ...boots, inScene: true, slot: "shoes" as const },
  { ...pinkSet, inScene: true, slot: "outfit" as const },
];
assert.equal(
  outfitLineFromPins(worn as never),
  "pink zip hoodie, cream top, grey leggings, white fluffy boots; white fluffy boots",
  "the outfit comes first, then the pieces",
);
assert.equal(outfitStillMatches("still in the pink zip hoodie and leggings", worn as never), true);
assert.equal(outfitStillMatches("a black dress and heels", worn as never), false, "a different outfit is noticed");

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

// ── The closet: saved outfits, wornLook in any chat, never sharing a picture with one ──
const { closetOutfits, createClosetStorage } = await import("../../packages/server/src/services/board/fork-closet.js");
const { saveLorebookImage } = await import("../../packages/server/src/services/lorebook/lorebook-images.js");
registerForkTables([closetOutfits]);
const closet = createClosetStorage(db);
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const realPin = async (caption: string, slot: string) =>
  (await pins.create({
    scopeType: "chat",
    scopeId: "chat-closet",
    imagePath: (await saveLorebookImage(tinyPng)).path,
    caption,
    category: "wearing",
    who: "persona",
    slot,
  }))!;
const work = await realPin("navy pinstripe shirt, black pencil skirt", "outfit");
const flats = await realPin("black ballet flats", "shoes");
const look = (await closet.create("Work fit", [work.id, flats.id]))!;
assert.equal(look.pieces.length, 2, "a look keeps every piece");
assert.ok(
  look.pieces.every((piece) => piece.imagePath !== work.imagePath && piece.imagePath !== flats.imagePath),
  "the closet keeps its own copies of the pictures",
);
assert.ok(
  look.pieces.every((piece) => !piece.inScene),
  "a closet piece is never in a scene",
);
assert.equal((await pins.listForPrompt("chat-closet", null)).length, 2, "the closet adds nothing to a prompt");

// Worn in a new chat by a character: the pieces join that board in scene, outfit first.
const veeHoodie = await pins.create({
  scopeType: "chat",
  scopeId: "chat-new",
  imagePath: (await saveLorebookImage(tinyPng)).path,
  caption: "grey hoodie",
  category: "wearing",
  who: "char-veeHoodie",
  slot: "outfit",
});
const wornLook = await closet.wear(look.id, "chat-new", "char-veeHoodie");
assert.equal(wornLook.length, 2);
assert.deepEqual(
  wornLook.map((pin) => pin.slot),
  ["outfit", "shoes"],
  "the whole outfit goes on first",
);
assert.ok(wornLook.every((pin) => pin.inScene && pin.who === "char-veeHoodie"));
assert.equal((await pins.getById(veeHoodie!.id))!.inScene, false, "it replaces what Vee had on");

// Deleting the outfit leaves the chat wearing it untouched.
await closet.remove(look.id);
assert.equal((await closet.list()).length, 0);
assert.equal((await pins.listForScope("outfit", look.id)).length, 0);
assert.equal((await pins.listForScope("chat", "chat-new")).filter((pin) => pin.inScene).length, 2);
assert.equal((await closet.create("", []))!.name, "Outfit", "an unnamed outfit still gets a name");

await closeDB();
rmSync(dir, { recursive: true, force: true });
console.log("fork reference board: ok");
