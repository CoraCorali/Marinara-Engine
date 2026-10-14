// ──────────────────────────────────────────────
// Fork: chapters (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api-client";
import { translate } from "../localization/i18n";

export interface ForkChapter {
  id: string;
  chatId: string;
  number: number;
  title: string;
  firstMessageId: string;
  firstMessageAt: string;
  lastMessageId: string;
  lastMessageAt: string;
  messageCount: number;
  recap: string;
  stale: boolean;
}

export interface ForkChaptersState {
  chapters: ForkChapter[];
  current: { number: number; firstMessageId: string | null; messageCount: number };
  /** A chapter this long gets a gentle nudge to end it. */
  longChapter: number;
}

export const chapterKeys = {
  chat: (chatId: string | null) => ["fork-chapters", chatId ?? "none"] as const,
  /** Every place that ends a chapter shares this key, so the pill can show a recap being written. */
  ending: (chatId: string | null) => ["fork-chapters-end", chatId ?? "none"] as const,
};

export function useForkChapters(chatId: string | null) {
  return useQuery({
    queryKey: chapterKeys.chat(chatId),
    queryFn: () => api.get<ForkChaptersState>(`/fork-chapters/chats/${chatId}`),
    enabled: !!chatId,
    staleTime: 30_000,
  });
}

function failed(error: unknown) {
  toast.error(error instanceof Error ? error.message : translate("ui.chat.forkchapters.failed"));
}

export function useEndForkChapter(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: chapterKeys.ending(chatId),
    mutationFn: (input: { upToMessageId?: string | null; debugMode?: boolean }) =>
      api.post<ForkChapter>(`/fork-chapters/chats/${chatId}/end`, input),
    onSuccess: (chapter) => {
      toast.success(
        translate("ui.chat.forkchapters.ended", {
          number: chapter.number,
          title: chapter.title || translate("ui.chat.forkchapters.untitled"),
        }),
      );
    },
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: chapterKeys.chat(chatId) }),
  });
}

export function useReopenForkChapter(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ reopened: ForkChapter }>(`/fork-chapters/chats/${chatId}/reopen`, {}),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: chapterKeys.chat(chatId) }),
  });
}

export function useEditForkChapter(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; title?: string; recap?: string }) =>
      api.patch<ForkChapter>(`/fork-chapters/${input.id}`, { title: input.title, recap: input.recap }),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: chapterKeys.chat(chatId) }),
  });
}

export function useRewriteForkRecap(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; debugMode?: boolean }) =>
      api.post<ForkChapter>(`/fork-chapters/${input.id}/recap`, { debugMode: input.debugMode }),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: chapterKeys.chat(chatId) }),
  });
}

/** Marinara's message order: createdAt, then id. */
function compareKeys(left: { id: string; createdAt: string }, right: { id: string; createdAt: string }) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

/** The finished chapter a message belongs to, or null for the current chapter. */
export function chapterForMessage(
  message: { id: string; createdAt?: string | null },
  chapters: readonly ForkChapter[],
): ForkChapter | null {
  const key = { id: message.id, createdAt: message.createdAt ?? "" };
  return (
    chapters.find(
      (chapter) => compareKeys(key, { id: chapter.lastMessageId, createdAt: chapter.lastMessageAt }) <= 0,
    ) ?? null
  );
}
