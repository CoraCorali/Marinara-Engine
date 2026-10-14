// ──────────────────────────────────────────────
// Fork: the relationship tracker (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";

export const BOND_KINDS = ["love", "family", "friend", "rival", "ex", "other"] as const;
export type BondKind = (typeof BOND_KINDS)[number];

export const LOVE_STAGES = ["talking", "dating", "together", "living", "engaged", "married"] as const;
export type LoveStage = (typeof LOVE_STAGES)[number];

/** The two things each kind of bond tracks. A friend is never scored like a love interest. */
export const BOND_METERS: Record<BondKind, readonly [string, string]> = {
  love: ["wanting", "patience"],
  family: ["closeness", "friction"],
  friend: ["closeness", "trust"],
  rival: ["respect", "hostility"],
  ex: ["unfinished", "bitterness"],
  other: ["closeness", "trust"],
};

export interface Bond {
  id: string;
  chatId: string;
  characterId: string;
  label: string;
  kind: BondKind;
  stage: LoveStage | null;
  first: number;
  second: number;
  note: string;
  order: number;
}

export const bondKeys = {
  all: (chatId: string | null) => ["fork-bonds", chatId ?? "none"] as const,
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

export function useAddBond(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { characterId: string; label?: string; kind?: BondKind }) =>
      api.post<Bond>("/fork-bonds/bonds", { chatId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: bondKeys.all(chatId) }),
  });
}

export function useUpdateBond(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      label?: string;
      kind?: BondKind;
      stage?: LoveStage;
      first?: number;
      second?: number;
      note?: string;
    }) => api.patch<Bond>(`/fork-bonds/bonds/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: bondKeys.all(chatId) }),
  });
}

export function useDeleteBond(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-bonds/bonds/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: bondKeys.all(chatId) }),
  });
}
