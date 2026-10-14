// Fork: the fork's own file-backed tables (see FORK.md).
import { boardPins } from "../services/board/fork-board-pins.js";
import { bondMoments, bondTurns, bonds } from "../services/bonds/fork-bonds.js";

/**
 * Registered on the store the moment it opens, the same path capability packages use, so they need
 * no storage-format bump and an older Marinara just ignores the files. Registering them here rather
 * than in app startup means anything that opens storage (a script, a test, a tool) can generate
 * without "Unsupported table: fork_bonds".
 */
export const FORK_TABLES: readonly unknown[] = [boardPins, bonds, bondMoments, bondTurns];
