// ──────────────────────────────────────────────
// Fork: Pocket Phone (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ForkPhoneLook, ForkPhoneSettings } from "@marinara-engine/shared";
import { toast } from "sonner";
import { api } from "../lib/api-client";
import { translate } from "../localization/i18n";

export const PHONE_PERSONA = "persona";

export interface PhoneThread {
  id: string;
  chatId: string;
  a: string;
  b: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneMessage {
  id: string;
  threadId: string;
  chatId: string;
  sender: string;
  body: string;
  kind: "text" | "call" | "call_line" | "photo" | "draft";
  storyTime: string;
  afterMessageId: string;
  source: "user" | "agent";
  callId: string;
  swipes: string[];
  activeSwipe: number;
  read: boolean;
  createdAt: string;
}

export interface PhoneState {
  settings: ForkPhoneSettings;
  threads: PhoneThread[];
  messages: PhoneMessage[];
}

export const phoneKeys = { chat: (chatId: string | null) => ["fork-phone", chatId ?? "none"] as const };

export function useForkPhone(chatId: string | null) {
  return useQuery({
    queryKey: phoneKeys.chat(chatId),
    queryFn: () => api.get<PhoneState>(`/fork-phone/chats/${chatId}`),
    enabled: !!chatId,
    staleTime: 30_000,
  });
}

function failed(error: unknown) {
  toast.error(error instanceof Error && error.message ? error.message : translate("ui.chat.forkphone.failed"));
}

export function useUpdatePhoneSettings(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Partial<ForkPhoneLook> & { on?: boolean; characterLook?: { id: string; look: Partial<ForkPhoneLook> } },
    ) => api.patch<ForkPhoneSettings>(`/fork-phone/chats/${chatId}/settings`, patch),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

export function useSendText(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: string; body: string }) =>
      api.post<PhoneMessage>(`/fork-phone/chats/${chatId}/texts`, input),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

export function useEditText(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      api.patch<PhoneMessage>(`/fork-phone/messages/${input.id}`, { body: input.body }),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

export function useDeleteText(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-phone/messages/${id}`),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

export function useMarkThreadRead(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.post<{ success: boolean }>(`/fork-phone/threads/${threadId}/read`, {}),
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

/** The other side of a thread, from the persona's phone. */
export function otherSide(thread: PhoneThread, me = PHONE_PERSONA): string {
  return thread.a === me ? thread.b : thread.a;
}

/** Unread texts on the persona's phone. */
export function unreadCount(state: PhoneState | undefined): number {
  if (!state) return 0;
  const mine = new Set(
    state.threads
      .filter((thread) => thread.a === PHONE_PERSONA || thread.b === PHONE_PERSONA)
      .map((thread) => thread.id),
  );
  return state.messages.filter(
    (message) => mine.has(message.threadId) && !message.read && message.sender !== PHONE_PERSONA,
  ).length;
}
