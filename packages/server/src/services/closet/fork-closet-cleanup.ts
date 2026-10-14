// Fork feature: tidy up a closet when its persona goes (see FORK.md).
//
// Lives apart from fork-closet-items so the character store can call it without pulling in the
// table definition, which would make their imports circular.
import type { DB } from "../../db/connection.js";
import { createClosetStorage } from "./fork-closet-items.js";
import { discardLorebookImage } from "../lorebook/lorebook-images.js";
import { logger } from "../../lib/logger.js";

/** Deletes a persona's wardrobe and its pictures. Never throws: a closet must not block a delete. */
export async function removeForkCloset(db: DB, personaId: string): Promise<void> {
  try {
    const imagePaths = await createClosetStorage(db).removePersona(personaId);
    for (const path of imagePaths) {
      await discardLorebookImage({ path, caption: "" }).catch(() => undefined);
    }
  } catch (error) {
    logger.warn(error, "[fork-closet] Could not clear the closet for persona %s", personaId);
  }
}
