// ──────────────────────────────────────────────
// Fork: the closet — a persona's wardrobe (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";

export const CLOSET_SLOTS = ["dress", "top", "bottom", "outer", "shoes", "bag", "jewellery", "extra"] as const;
export type ClosetSlot = (typeof CLOSET_SLOTS)[number];

export interface ClosetItem {
  id: string;
  personaId: string;
  slot: ClosetSlot;
  imagePath: string;
  label: string;
  worn: boolean;
  source: "generated" | "upload";
  order: number;
}

export const closetKeys = {
  items: (personaId: string | null) => ["fork-closet", personaId ?? "none"] as const,
};

export function useClosetItems(personaId: string | null) {
  return useQuery({
    queryKey: closetKeys.items(personaId),
    queryFn: () => api.get<ClosetItem[]>(`/fork-closet/items?personaId=${encodeURIComponent(personaId!)}`),
    enabled: Boolean(personaId),
    staleTime: 60_000,
  });
}

export function useAddClosetItem(personaId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; label?: string; slot?: ClosetSlot; wear?: boolean }) => {
      const form = new FormData();
      form.append("personaId", personaId!);
      if (input.label) form.append("label", input.label);
      if (input.slot) form.append("slot", input.slot);
      if (input.wear) form.append("wear", "true");
      form.append("file", input.file);
      return api.upload<ClosetItem>("/fork-closet/items", form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: closetKeys.items(personaId) }),
  });
}

export function useUpdateClosetItem(personaId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; label?: string; slot?: ClosetSlot; order?: number }) =>
      api.patch<ClosetItem>(`/fork-closet/items/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: closetKeys.items(personaId) }),
  });
}

/** Put a piece on, or take it off. Whatever it cannot be worn beside comes off on the server. */
export function useWearClosetItem(personaId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, worn }: { id: string; worn: boolean }) =>
      api.post<ClosetItem[]>(`/fork-closet/items/${id}/${worn ? "wear" : "take-off"}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: closetKeys.items(personaId) }),
  });
}

export function useDeleteClosetItem(personaId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-closet/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: closetKeys.items(personaId) }),
  });
}
