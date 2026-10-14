// ──────────────────────────────────────────────
// File Storage Connection
// ──────────────────────────────────────────────
import { logger } from "../lib/logger.js";
import {
  createFileNativeDB,
  type FileNativeDB,
  type FileNativeStoreController,
  type FileStoreStats,
} from "./file-backed-store.js";

type DbCleanup = () => void | Promise<void>;

let dbPromise: Promise<DB> | null = null;
let dbCleanup: DbCleanup | null = null;
let fileStore: FileNativeStoreController | null = null;

async function createStorage(): Promise<DB> {
  const db = await createFileNativeDB();
  fileStore = db._fileStore;
  dbCleanup = async () => {
    await fileStore?.close();
    fileStore = null;
  };
  return db;
}

export async function getDB() {
  if (!dbPromise) {
    dbPromise = createStorage();
  }
  return dbPromise;
}

/**
 * Fork: register extra file-backed tables on the live store, the same path capability packages
 * use. Keeps the reference board off the built-in table list, so no storage-format bump is needed.
 */
export function registerForkTables(tables: readonly unknown[]): void {
  fileStore?.registerTables(tables);
}

/** Cheap in-memory counters for diagnostics; null before storage opens or after it closes. */
export function getFileStoreStats(): FileStoreStats | null {
  return fileStore?.getStorageStats?.() ?? null;
}

export async function flushDB() {
  await fileStore?.flush();
}

export async function closeDB() {
  const activePromise = dbPromise;
  if (!activePromise) {
    return;
  }

  dbPromise = null;

  try {
    await activePromise;
  } catch (err) {
    logger.error(err, "[db] Failed to initialize database before shutdown");
    dbCleanup = null;
    return;
  }

  const cleanup = dbCleanup;
  dbCleanup = null;
  if (!cleanup) {
    return;
  }

  try {
    await cleanup();
  } catch (err) {
    logger.error(err, "[db] Failed to close database");
  }
}

export type DB = FileNativeDB;
