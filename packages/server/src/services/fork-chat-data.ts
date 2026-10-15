// Fork feature: a chat's board pins and relationships follow it through branches and deletes
// (see FORK.md). Both are registered storage, so Marinara's own branch copy and delete cascade
// never reach them.
import type { DB } from "../db/connection.js";
import { createBoardPinsStorage } from "./board/fork-board-pins.js";
import { removeForkBoardScope } from "./board/fork-board-cleanup.js";
import { bondMoments, bondTurns, bonds, createBondsStorage } from "./bonds/fork-bonds.js";
import { bondPairs, createBondPairsStorage } from "./bonds/fork-bond-pairs.js";
import { undoBondTurn } from "./bonds/fork-bond-updates.js";
import { createChaptersStorage } from "./chapters/fork-chapters.js";
import { createPhoneStorage } from "./phone/fork-phone.js";
import { branchPhoneRunState, phoneRunMetadata, readPhoneRunState } from "./phone/fork-phone-agent.js";
import { FORK_THING_AT_PLACE } from "@marinara-engine/shared";
import { eq } from "../db/file-query.js";
import { readLorebookImageDataUrl, saveLorebookImage } from "./lorebook/lorebook-images.js";
import { logger } from "../lib/logger.js";

/** Clears a chat's board and relationships. Never throws: losing either must not block a delete. */
export async function removeForkChatData(db: DB, chatId: string): Promise<void> {
  await removeForkBoardScope(db, "chat", chatId);
  await createChaptersStorage(db)
    .removeChat(chatId)
    .catch((error) => logger.warn(error, "[fork-chapters] Could not clear the chapters for chat %s", chatId));
  await createPhoneStorage(db)
    .removeChat(chatId)
    .catch((error) => logger.warn(error, "[fork-phone] Could not clear the phones for chat %s", chatId));
  await createBondsStorage(db)
    .removeChat(chatId)
    .catch((error) => logger.warn(error, "[fork-bonds] Could not clear the relationships for chat %s", chatId));
  await createBondPairsStorage(db)
    .removeChat(chatId)
    .catch((error) => logger.warn(error, "[fork-bonds] Could not clear the pairs for chat %s", chatId));
}

/**
 * Gives a new branch its own copy of the source chat's board and relationships, so a branch starts
 * where the story was rather than with an empty tracker. Pictures are copied, not shared, because
 * removing a pin deletes its picture. Never throws: a branch without its board is still a branch.
 */
export async function copyForkChatData(
  db: DB,
  fromChatId: string,
  toChatId: string,
  messageIdMap: ReadonlyMap<string, string> = new Map(),
  /** The source chat's metadata: the phone's memory of its replies is mapped onto the branch. */
  sourceMetadata?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Chapters come along while every message of theirs did: a branch from inside a finished chapter
  // keeps that chapter open, and the ones after it are not part of the branch's story.
  try {
    const store = createChaptersStorage(db);
    for (const chapter of await store.listForChat(fromChatId)) {
      const first = messageIdMap.get(chapter.firstMessageId);
      const last = messageIdMap.get(chapter.lastMessageId);
      if (!first || !last) break;
      await store.create({
        chatId: toChatId,
        title: chapter.title,
        first: { id: first, createdAt: chapter.firstMessageAt },
        last: { id: last, createdAt: chapter.lastMessageAt },
        messageCount: chapter.messageCount,
        recap: chapter.recap,
      });
      if (chapter.stale) await store.markStale(toChatId, [{ id: last, createdAt: chapter.lastMessageAt }]);
    }
  } catch (error) {
    logger.warn(error, "[fork-chapters] Could not copy the chapters from chat %s to %s", fromChatId, toChatId);
  }
  // The phones' texts up to the branch point come along, tied to the branch's own messages, and so
  // does what the phone agent remembers (queued texts, looks at a phone) from those replies only.
  // The caller writes it into the branch's metadata, which it builds from the source's.
  let metadata: Record<string, unknown> = {};
  try {
    const { threads } = await createPhoneStorage(db).copyToBranch(fromChatId, toChatId, messageIdMap);
    const source = sourceMetadata ? readPhoneRunState(sourceMetadata) : null;
    if (source) metadata = phoneRunMetadata(branchPhoneRunState(source, messageIdMap, threads));
  } catch (error) {
    logger.warn(error, "[fork-phone] Could not copy the phones from chat %s to %s", fromChatId, toChatId);
  }
  try {
    const pins = createBoardPinsStorage(db);
    const copyPicture = async (path: string) => {
      const dataUrl = await readLorebookImageDataUrl(path);
      return dataUrl
        ? (await saveLorebookImage(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"))).path
        : null;
    };
    const pinIds = new Map<string, string>();
    const copies: { id: string; details: Record<string, unknown> }[] = [];
    for (const pin of await pins.listForScope("chat", fromChatId)) {
      const imagePath = await copyPicture(pin.imagePath);
      if (!imagePath) continue;
      const album = [];
      for (const entry of pin.details.album ?? []) {
        const path = await copyPicture(entry.path);
        if (path) album.push({ ...entry, path });
      }
      const copy = await pins.create({
        scopeType: "chat",
        scopeId: toChatId,
        imagePath,
        caption: pin.caption,
        category: pin.category,
        inScene: pin.inScene,
        who: pin.who,
        slot: pin.slot,
        shows: pin.shows,
        name: pin.name,
      });
      if (!copy) continue;
      pinIds.set(pin.id, copy.id);
      copies.push({ id: copy.id, details: { ...pin.details, album } });
    }
    // A thing left at a place or inside another thing points at the branch's own copy of it.
    for (const copy of copies) {
      const details = copy.details as { holder?: string; inside?: string };
      if (details.holder?.startsWith(FORK_THING_AT_PLACE))
        details.holder = FORK_THING_AT_PLACE + (pinIds.get(details.holder.slice(FORK_THING_AT_PLACE.length)) ?? "");
      if (details.inside) details.inside = pinIds.get(details.inside) ?? "";
      await pins.update(copy.id, { details: copy.details });
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
  try {
    const pairs = createBondPairsStorage(db);
    for (const pair of await pairs.listForChat(fromChatId)) {
      await pairs.create({
        chatId: toChatId,
        firstId: pair.aId,
        secondId: pair.bId,
        kind: pair.kind,
        rung: pair.rung,
        aLine: pair.aLine,
        bLine: pair.bLine,
      });
    }
  } catch (error) {
    logger.warn(error, "[fork-bonds] Could not copy the pairs from chat %s to %s", fromChatId, toChatId);
  }
  return metadata;
}

/**
 * A deleted character leaves People with it: its bonds (and their moments) and every pair it is in,
 * in every chat. Never throws: the character delete has already happened.
 */
export async function removeForkCharacterData(db: DB, characterId: string): Promise<void> {
  try {
    const store = createBondsStorage(db);
    const rows = (await db.select().from(bonds).where(eq(bonds.characterId, characterId))) as unknown as {
      id: string;
    }[];
    for (const row of rows) await store.remove(row.id);
    const pairRows = (await db.select().from(bondPairs)) as unknown as { id: string; aId: string; bId: string }[];
    for (const pair of pairRows) {
      if (pair.aId === characterId || pair.bId === characterId)
        await db.delete(bondPairs).where(eq(bondPairs.id, pair.id));
    }
  } catch (error) {
    logger.warn(error, "[fork-bonds] Could not clear the relationships of character %s", characterId);
  }
}

/**
 * Deleted replies take back what their tracker run moved, as a swipe does: a value is only put back
 * while it still holds what that run left, and the run's moments go. Newest first. Never throws.
 */
export async function forgetForkReplies(
  db: DB,
  removed: readonly { id: string; chatId: string; createdAt: string }[],
): Promise<void> {
  await markForkChaptersStale(db, removed);
  // Every phone message shown after a deleted story message goes with it, yours included.
  for (const chatId of new Set(removed.map((message) => message.chatId))) {
    await createPhoneStorage(db)
      .forgetMessagesAfter(
        chatId,
        removed.filter((message) => message.chatId === chatId).map((message) => message.id),
      )
      .catch((error) => logger.warn(error, "[fork-phone] Could not take back the phone texts of chat %s", chatId));
  }
  // Two reads per chat find the replies that left a tracker run or a moment; only those are undone,
  // so deleting many ordinary messages costs the same as deleting one.
  const tracked = new Set<string>();
  for (const chatId of new Set(removed.map((message) => message.chatId))) {
    try {
      const turns = (await db.select().from(bondTurns).where(eq(bondTurns.chatId, chatId))) as unknown as {
        messageId: string;
      }[];
      const moments = (await db.select().from(bondMoments).where(eq(bondMoments.chatId, chatId))) as unknown as {
        messageId: string;
      }[];
      for (const row of [...turns, ...moments]) if (row.messageId) tracked.add(`${chatId}\u0000${row.messageId}`);
    } catch (error) {
      logger.warn(error, "[fork-bonds] Could not read the tracker runs of chat %s", chatId);
    }
  }
  const newestFirst = removed
    .filter((message) => tracked.has(`${message.chatId}\u0000${message.id}`))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const message of newestFirst) {
    await undoBondTurn(db, message.chatId, message.id).catch((error) =>
      logger.warn(error, "[fork-bonds] Could not take back the tracker run of message %s", message.id),
    );
  }
}

/**
 * A message edited, swiped or deleted inside a finished chapter leaves its recap out of date. The
 * recap is only marked, never rewritten behind the writer's back. Never throws.
 */
export async function markForkChaptersStale(
  db: DB,
  changed: readonly { id: string; chatId: string; createdAt: string }[],
): Promise<void> {
  const store = createChaptersStorage(db);
  for (const chatId of new Set(changed.map((message) => message.chatId))) {
    await store
      .markStale(
        chatId,
        changed.filter((message) => message.chatId === chatId),
      )
      .catch((error) => logger.warn(error, "[fork-chapters] Could not mark the recaps of chat %s", chatId));
  }
}
