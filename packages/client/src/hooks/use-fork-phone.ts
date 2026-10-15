// ──────────────────────────────────────────────
// Fork: Pocket Phone (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ForkPhoneContact, ForkPhoneLook, ForkPhoneRelation, ForkPhoneSettings } from "@marinara-engine/shared";
import { toast } from "sonner";
import { api } from "../lib/api-client";
import { translate } from "../localization/i18n";
import { useUIStore } from "../stores/ui.store";
import { useForkPhoneStore } from "../stores/fork-phone.store";

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
  /** The story's day when it was sent, for the day lines. */
  storyDate: string;
  /** Your text, seen and left unanswered: the story time they saw it, or "seen". */
  seenAt: string;
  createdAt: string;
}

export interface PhoneCall {
  /** The call card's message id. */
  id: string;
  /** The character on the other end. */
  from: string;
  about: string;
  state: "ringing" | "live";
}

export interface PhoneState {
  settings: ForkPhoneSettings;
  threads: PhoneThread[];
  messages: PhoneMessage[];
  /** A call ringing or on the line. */
  call: PhoneCall | null;
  /** Texts and calls written ahead that have not arrived yet. */
  waiting: number;
  /** Character names for every thread, including characters who have left the chat. */
  names: Record<string, string>;
  /** Phones the latest reply left within your reach. */
  reachable: { reply: string; ids: string[] } | null;
  /** Characters whose phone has been written, with their camera roll. */
  written: Record<string, { photos: string[] }>;
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

/** Answer, decline, call out, say a line or hang up. */
export function useCallAction(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        { action: "answer" | "decline" | "hang-up" } | { action: "say"; line: string } | { action: "call"; to: string },
    ) =>
      input.action === "call"
        ? api.post<{ callId: string }>(`/fork-phone/chats/${chatId}/calls`, { to: input.to })
        : api.post<unknown>(`/fork-phone/chats/${chatId}/call/${input.action}`, {
            line: input.action === "say" ? input.line : undefined,
            debugMode: useUIStore.getState().debugMode,
          }),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

/** ponytail: a call's length is guessed from its lines (about three a minute); calls carry no story clock. */
export function callMinutes(lines: number): number {
  return Math.max(1, Math.ceil(lines / 3));
}

/** Tells you what just arrived on your phone, with a tap to open it. */
function announce(added: readonly PhoneMessage[], state: PhoneState | undefined, nameOf: (side: string) => string) {
  if (!state) return;
  const mine = new Set(
    state.threads
      .filter((thread) => thread.a === PHONE_PERSONA || thread.b === PHONE_PERSONA)
      .map((thread) => thread.id),
  );
  const texts = added.filter((message) => message.kind === "text" && mine.has(message.threadId));
  const senders = [...new Set(texts.map((message) => message.sender))];
  if (senders.length === 0) return;
  toast(translate("ui.chat.forkphone.newTexts", { names: senders.map(nameOf).join(", "), count: texts.length }), {
    action: {
      label: translate("ui.chat.forkphone.openToast"),
      onClick: () => useForkPhoneStore.getState().setOpenTo(senders.length === 1 ? senders[0]! : "home"),
    },
  });
}

/**
 * After a story reply (or a new swipe of it): the phone agent decides who texts or calls. Runs in
 * the background; only while this chat's phone is on.
 */
export function runPhoneAfterReply(qc: QueryClient, chatId: string, messageId: string) {
  const cached = qc.getQueryData<PhoneState>(phoneKeys.chat(chatId));
  if (!cached?.settings.on || !messageId) return;
  void api
    .post<{ ran: boolean; added: PhoneMessage[] }>(`/fork-phone/chats/${chatId}/after-reply`, {
      messageId,
      debugMode: useUIStore.getState().debugMode,
    })
    .then(async (result) => {
      await qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) });
      announce(result.added, qc.getQueryData<PhoneState>(phoneKeys.chat(chatId)), phoneNames.get(chatId) ?? String);
    })
    // A missed phone run costs nothing: the next reply runs it again, and the error is logged there.
    .catch(() => undefined);
}

/** You stayed in the chat a while: whatever was waiting arrives. */
export function deliverIdlePhone(qc: QueryClient, chatId: string) {
  void api
    .post<{ added: PhoneMessage[] }>(`/fork-phone/chats/${chatId}/idle`, {})
    .then(async (result) => {
      await qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) });
      announce(result.added, qc.getQueryData<PhoneState>(phoneKeys.chat(chatId)), phoneNames.get(chatId) ?? String);
    })
    .catch(() => undefined);
}

/** Names for the toasts, kept by the phone pill of the open chat. */
export const phoneNames = new Map<string, (side: string) => string>();

/** Look at a character's phone the story left within reach (the first look writes it). */
export function usePeek(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (characterId: string) =>
      api.post<{ success: boolean }>(`/fork-phone/chats/${chatId}/peek`, {
        characterId,
        debugMode: useUIStore.getState().debugMode,
      }),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

/** Tells the story you opened one of their conversations while peeking. */
export function markPeekSeen(chatId: string, characterId: string, threadId: string) {
  void api.post(`/fork-phone/chats/${chatId}/peek/seen`, { characterId, threadId }).catch(() => undefined);
}

export const PHONE_CONTACT = "contact:";
/** Someone texting you from a number you have not saved; the phone shows no name. */
export const PHONE_UNKNOWN = "unknown:";

/** Add, change or delete one of your contacts. */
export function useContacts(chatId: string | null) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) });
  const base = `/fork-phone/chats/${chatId}/contacts`;
  return {
    add: useMutation({
      /** `from`: an unknown number being saved, whose texts move to the new contact. */
      mutationFn: (input: Omit<ForkPhoneContact, "relation"> & { relation: ForkPhoneRelation; from?: string }) =>
        api.post<{ contacts: ForkPhoneContact[] }>(base, input),
      onError: failed,
      onSettled: done,
    }),
    edit: useMutation({
      /** `rename`: a new name; their texts move with it. */
      mutationFn: (input: ForkPhoneContact & { rename?: string }) =>
        api.patch<{ contacts: ForkPhoneContact[] }>(`${base}/${encodeURIComponent(input.name)}`, input),
      onError: failed,
      onSettled: done,
    }),
    remove: useMutation({
      mutationFn: (name: string) => api.delete<{ contacts: ForkPhoneContact[] }>(`${base}/${encodeURIComponent(name)}`),
      onError: failed,
      onSettled: done,
    }),
  };
}

/** Whoever you are texting (a card character id, or a contact side) answers your newest text. */
export function useTextReply(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (side: string) =>
      api.post<{ added: PhoneMessage[] }>(
        side.startsWith(PHONE_CONTACT)
          ? `/fork-phone/chats/${chatId}/contacts/${encodeURIComponent(side.slice(PHONE_CONTACT.length))}/reply`
          : `/fork-phone/chats/${chatId}/characters/${encodeURIComponent(side)}/reply`,
        { debugMode: useUIStore.getState().debugMode },
      ),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

/** Clears a whole conversation on your phone. */
export function useClearThread(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.delete<{ success: boolean }>(`/fork-phone/threads/${threadId}`),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

/** Their newest text: another version (`fresh`), or a version by number (`to`). */
export function useSwipeText(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; to?: number }) =>
      api.post<PhoneMessage>(`/fork-phone/messages/${input.id}/swipe`, {
        ...(typeof input.to === "number" ? { to: input.to } : { fresh: true }),
        debugMode: useUIStore.getState().debugMode,
      }),
    onError: failed,
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.chat(chatId) }),
  });
}

/** A rewrite of their text from Fix this part. Nothing is saved until it is kept. */
export function useFixText(chatId: string | null) {
  return useMutation({
    mutationFn: (input: { id: string; instruction: string }) =>
      api.post<{ replacement: string }>("/fork-fix/part", {
        chatId,
        phoneMessageId: input.id,
        instruction: input.instruction,
        debugMode: useUIStore.getState().debugMode,
      }),
    onError: failed,
  });
}
