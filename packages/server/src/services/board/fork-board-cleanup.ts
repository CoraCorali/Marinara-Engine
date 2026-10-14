// Fork feature: tidy up a reference board when its chat or persona goes (see FORK.md).
//
// Lives apart from fork-board-pins so the chat and character stores can call it without pulling in
// the table definition, which would make their imports circular.
import type { DB } from "../../db/connection.js";
import { createBoardPinsStorage, type BoardScopeType } from "./fork-board-pins.js";
import { discardLorebookImage } from "../lorebook/lorebook-images.js";
import { logger } from "../../lib/logger.js";

/** Deletes a scope's pins and their pictures. Never throws: losing a board must not block a delete. */
export async function removeForkBoardScope(db: DB, scopeType: BoardScopeType, scopeId: string): Promise<void> {
  try {
    const imagePaths = await createBoardPinsStorage(db).removeScope(scopeType, scopeId);
    for (const path of imagePaths) {
      await discardLorebookImage({ path, caption: "" }).catch(() => undefined);
    }
  } catch (error) {
    logger.warn(error, "[fork-board] Could not clear the board for %s %s", scopeType, scopeId);
  }
}
