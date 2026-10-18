// Fork feature: what moved lately in People (see FORK.md).
//
// Each reply's tracker run is kept as a turn (fork_bond_turns), so the last few turns say what
// changed and when: "Theo: Close → Confidant, in the last reply". The writer is told, so a fresh
// change is not forgotten two replies later, and the Relationships list shows it as a chip.
import { FORK_BOND_SHAPES, FORK_LOVE_STATUSES, type ForkBondKind } from "@marinara-engine/shared";
import { eq } from "../../db/file-query.js";
import type { DB } from "../../db/connection.js";
import { bondTurns } from "./fork-bonds.js";
import { createBondsStorage, type Bond } from "./fork-bonds.js";
import { createBondPairsStorage, type BondPair } from "./fork-bond-pairs.js";
import { createChatsStorage } from "../storage/chats.storage.js";

export type RecentBondChange = {
  /** The bond's id, or the pair's when `pair` is set. */
  id: string;
  pair: boolean;
  from: string;
  to: string;
  /** 0 for the newest reply, 1 for the one before, and so on. */
  repliesAgo: number;
  /** What moved: the rung, the status, the kind or only the drift. */
  key: "rung" | "status" | "kind" | "drift";
  /** A step up a warm ladder, or a romance moving forward: worth marking in the story. */
  milestone: boolean;
};

type Values = Partial<Record<"kind" | "status" | "rung" | "route" | "condition" | "drift", string>>;

/** The one move worth a line: the rung first, then the status, the kind, the drift. */
function headline(before: Values, after: Values): { key: keyof Values; from: string; to: string } | null {
  for (const key of ["rung", "status", "kind", "drift"] as const) {
    if (after[key] !== undefined && after[key] !== before[key]) {
      return { key, from: before[key] ?? "", to: after[key] ?? "" };
    }
  }
  return null;
}

/** Whether a move is a step forward worth marking: up a warm ladder, or a romance's next status. */
export function isBondMilestone(kind: ForkBondKind | undefined, key: keyof Values, from: string, to: string): boolean {
  if (key === "status") {
    const statuses = FORK_LOVE_STATUSES as readonly string[];
    return statuses.indexOf(from) >= 0 && statuses.indexOf(to) > statuses.indexOf(from);
  }
  if (key !== "rung" || !kind) return false;
  const shape = FORK_BOND_SHAPES[kind];
  return shape.ladders.some((ladder, index) => {
    if (shape.awayLadders?.includes(index)) return false;
    const start = ladder.indexOf(from);
    return start >= 0 && ladder.indexOf(to) > start;
  });
}

/**
 * The newest change for each bond and pair within the last `withinReplies` replies.
 * `replyIds` are the chat's assistant messages, oldest first; a turn whose reply is gone (deleted,
 * or the one being regenerated) is skipped.
 */
export async function listRecentBondChanges(
  db: DB,
  chatId: string,
  replyIds: readonly string[],
  withinReplies = 12,
): Promise<RecentBondChange[]> {
  if (!chatId || replyIds.length === 0) return [];
  const rows = (await db.select().from(bondTurns).where(eq(bondTurns.chatId, chatId))) as unknown as {
    messageId: string;
    changes: string;
  }[];
  const kinds = new Map<string, ForkBondKind>([
    ...(await createBondsStorage(db).listForChat(chatId)).map((bond) => [bond.id, bond.kind] as const),
    ...(await createBondPairsStorage(db).listForChat(chatId)).map((pair) => [pair.id, pair.kind] as const),
  ]);
  const position = new Map(replyIds.map((id, index) => [id, replyIds.length - 1 - index]));
  const newest = new Map<string, RecentBondChange>();
  for (const row of rows) {
    const repliesAgo = position.get(row.messageId);
    if (repliesAgo === undefined || repliesAgo >= withinReplies) continue;
    let changes: { bondId: string; before?: Values; after?: Values; pair?: boolean; thing?: boolean }[] = [];
    try {
      changes = JSON.parse(row.changes);
    } catch {
      continue;
    }
    for (const change of Array.isArray(changes) ? changes : []) {
      // A board thing's change rides in the same turn; it is not a relationship's.
      if (change.thing) continue;
      const move = headline(change.before ?? {}, change.after ?? {});
      if (!move) continue;
      const known = newest.get(change.bondId);
      if (known && known.repliesAgo <= repliesAgo) continue;
      newest.set(change.bondId, {
        id: change.bondId,
        pair: Boolean(change.pair),
        from: move.from,
        to: move.to,
        repliesAgo,
        key: move.key as RecentBondChange["key"],
        milestone: isBondMilestone(
          // A kind that changed in this turn has no ladder to climb; a pair records its kind every time.
          change.after?.kind && change.after.kind !== change.before?.kind ? undefined : kinds.get(change.bondId),
          move.key,
          move.from,
          move.to,
        ),
      });
    }
  }
  return [...newest.values()].sort((left, right) => left.repliesAgo - right.repliesAgo);
}

function when(repliesAgo: number): string {
  return repliesAgo === 0 ? "in the last reply" : repliesAgo === 1 ? "one reply ago" : `${repliesAgo} replies ago`;
}

/** The writer's line: what moved lately, newest first, so a fresh change carries through. */
export function recentChangesPromptBlock(
  changes: readonly RecentBondChange[],
  bonds: readonly Bond[],
  pairs: readonly BondPair[],
  nameFor: (characterId: string) => string,
  limit = 5,
): string {
  const lines = changes.flatMap((change) => {
    let who = "";
    if (change.pair) {
      const pair = pairs.find((candidate) => candidate.id === change.id);
      const a = pair ? nameFor(pair.aId) : "";
      const b = pair ? nameFor(pair.bId) : "";
      who = a && b ? `${a} & ${b}` : "";
    } else {
      const bond = bonds.find((candidate) => candidate.id === change.id);
      who = bond ? bond.label.trim() || nameFor(bond.characterId) : "";
    }
    if (!who || !change.to) return [];
    return [`- ${who}: ${change.from ? `${change.from} → ` : ""}${change.to} (${when(change.repliesAgo)})`];
  });
  return lines.length
    ? ["What changed lately (keep these changes showing; newest first):", ...lines.slice(0, limit)].join("\n")
    : "";
}

/**
 * For the Director: a step forward in the last two replies is a moment the story could mark. Said
 * as an offer, never an order, so the Director can suggest it when it fits.
 */
export function milestoneNudgeLine(
  changes: readonly RecentBondChange[],
  bonds: readonly Bond[],
  pairs: readonly BondPair[],
  nameFor: (characterId: string) => string,
): string {
  const fresh = changes.filter((change) => change.milestone && change.repliesAgo <= 1);
  const block = recentChangesPromptBlock(fresh, bonds, pairs, nameFor);
  if (!block) return "";
  return [
    "Milestones just reached (if the writer asks what to do next, or it fits, you may suggest a small beat that lets the story notice one; never push it):",
    ...block.split("\n").slice(1),
  ].join("\n");
}

/** The chat's recent replies, oldest first, for counting "replies ago" outside a generation. */
export async function recentReplyIds(db: DB, chatId: string, limit = 60): Promise<string[]> {
  const rows = (await createChatsStorage(db).listMessagePreviews(chatId, limit)) as { id: string; role: string }[];
  return rows.filter((row) => row.role === "assistant").map((row) => row.id);
}
