// Fork feature: a chat's board pins and relationships follow it through branches and deletes
// (see FORK.md). Both are registered storage, so Marinara's own branch copy and delete cascade
// never reach them.
import type { DB } from "../db/connection.js";
import { createBoardPinsStorage } from "./board/fork-board-pins.js";
import { removeForkBoardScope } from "./board/fork-board-cleanup.js";
import { createBondsStorage } from "./bonds/fork-bonds.js";
import { readLorebookImageDataUrl, saveLorebookImage } from "./lorebook/lorebook-images.js";
import { logger } from "../lib/logger.js";

/** Clears a chat's board and relationships. Never throws: losing either must not block a delete. */
export async function removeForkChatData(db: DB, chatId: string): Promise<void> {
  await removeForkBoardScope(db, "chat", chatId);
  await createBondsStorage(db)
    .removeChat(chatId)
    .catch((error) => logger.warn(error, "[fork-bonds] Could not clear the relationships for chat %s", chatId));
}

/**
 * Gives a new branch its own copy of the source chat's board and relationships, so a branch starts
 * where the story was rather than with an empty tracker. Pictures are copied, not shared, because
 * removing a pin deletes its picture. Never throws: a branch without its board is still a branch.
 */
export async function copyForkChatData(db: DB, fromChatId: string, toChatId: string): Promise<void> {
  try {
    const pins = createBoardPinsStorage(db);
    for (const pin of await pins.listForScope("chat", fromChatId)) {
      const dataUrl = await readLorebookImageDataUrl(pin.imagePath);
      if (!dataUrl) continue;
      const image = await saveLorebookImage(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
      await pins.create({
        scopeType: "chat",
        scopeId: toChatId,
        imagePath: image.path,
        caption: pin.caption,
        category: pin.category,
        inScene: pin.inScene,
        who: pin.who,
        slot: pin.slot,
        shows: pin.shows,
      });
    }
  } catch (error) {
    logger.warn(error, "[fork-board] Could not copy the board from chat %s to %s", fromChatId, toChatId);
  }
  try {
    const bonds = createBondsStorage(db);
    const moments = await bonds.listMomentsForChat(fromChatId);
    for (const { id, chatId: _chatId, ...bond } of await bonds.listForChat(fromChatId)) {
      const copy = await bonds.create({ ...bond, chatId: toChatId });
      if (!copy) continue;
      // The branch shares the story so far, so it starts with the same moments.
      for (const moment of moments.filter((entry) => entry.bondId === id)) {
        await bonds.addMoment({ ...moment, bondId: copy.id, chatId: toChatId, messageId: "" });
      }
    }
  } catch (error) {
    logger.warn(error, "[fork-bonds] Could not copy the relationships from chat %s to %s", fromChatId, toChatId);
  }
}
