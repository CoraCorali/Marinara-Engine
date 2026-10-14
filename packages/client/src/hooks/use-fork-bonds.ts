// ──────────────────────────────────────────────
// Fork: the relationship tracker (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ForkBondKind, ForkLoveStatus } from "@marinara-engine/shared";
import { toast } from "sonner";
import { api } from "../lib/api-client";
import { translate } from "../localization/i18n";

/**
 * A failed save says so. Without this an edit that did not reach the server just snapped back on
 * the next read, and looked like the panel ignoring the tap. One toast id, so a burst of failures
 * (the server is down) shows once.
 */
function saveFailed(error: unknown) {
  toast.error(error instanceof Error && error.message ? error.message : translate("ui.chat.forkbonds.couldNotSave"), {
    id: "fork-bonds-save",
  });
}

export interface Bond {
  id: string;
  chatId: string;
  characterId: string;
  label: string;
  kind: ForkBondKind;
  /** Where a romance has got to; null for every other kind. */
  status: ForkLoveStatus | null;
  rung: string;
  route: string;
  condition: string;
  drift: string;
  fields: Record<string, string>;
  order: number;
}

export interface BondMoment {
  id: string;
  bondId: string;
  chatId: string;
  from: string;
  to: string;
  text: string;
  createdAt: string;
}

export type BondPatch = {
  label?: string;
  kind?: ForkBondKind;
  status?: ForkLoveStatus;
  rung?: string;
  route?: string;
  condition?: string;
  drift?: string;
  /** Only the fields named; an empty string clears one. */
  fields?: Record<string, string>;
};

export const bondKeys = {
  all: (chatId: string | null) => ["fork-bonds", chatId ?? "none"] as const,
  moments: (chatId: string | null) => ["fork-bonds", chatId ?? "none", "moments"] as const,
};

export function useBonds(chatId: string | null) {
  return useQuery({
    queryKey: bondKeys.all(chatId),
    queryFn: () => api.get<Bond[]>(`/fork-bonds/bonds?chatId=${encodeURIComponent(chatId!)}`),
    enabled: Boolean(chatId),
    // An agent can have moved these during the last reply, so reopening the panel reads them again
    // rather than showing what they were a minute ago.
    staleTime: 0,
  });
}

export function useBondMoments(chatId: string | null) {
  return useQuery({
    queryKey: bondKeys.moments(chatId),
    queryFn: () => api.get<BondMoment[]>(`/fork-bonds/moments?chatId=${encodeURIComponent(chatId!)}`),
    enabled: Boolean(chatId),
    staleTime: 0,
  });
}

/** Bonds and their moments move together (a rung change adds a moment), so both are re-read. */
function useInvalidateBonds(chatId: string | null) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: bondKeys.all(chatId) });
}

export function useAddBond(chatId: string | null) {
  const invalidate = useInvalidateBonds(chatId);
  return useMutation({
    mutationFn: (input: { characterId: string; label?: string; kind?: ForkBondKind }) =>
      api.post<Bond>("/fork-bonds/bonds", { chatId, ...input }),
    onSuccess: invalidate,
    onError: saveFailed,
  });
}

export function useUpdateBond(chatId: string | null) {
  const invalidate = useInvalidateBonds(chatId);
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & BondPatch) => api.patch<Bond>(`/fork-bonds/bonds/${id}`, data),
    onSuccess: invalidate,
    onError: saveFailed,
  });
}

export function useDeleteBond(chatId: string | null) {
  const invalidate = useInvalidateBonds(chatId);
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-bonds/bonds/${id}`),
    onSuccess: invalidate,
    onError: saveFailed,
  });
}

export function useUpdateMoment(chatId: string | null) {
  const invalidate = useInvalidateBonds(chatId);
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.patch<BondMoment>(`/fork-bonds/moments/${id}`, { text }),
    onSuccess: invalidate,
    onError: saveFailed,
  });
}

export function useDeleteMoment(chatId: string | null) {
  const invalidate = useInvalidateBonds(chatId);
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-bonds/moments/${id}`),
    onSuccess: invalidate,
    onError: saveFailed,
  });
}
