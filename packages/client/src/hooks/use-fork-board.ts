// ──────────────────────────────────────────────
// Fork: Reference board pins (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";

export const BOARD_PIN_CATEGORIES = ["wearing", "place", "person", "thing", "vibe"] as const;
export type BoardPinCategory = (typeof BOARD_PIN_CATEGORIES)[number];

export interface BoardPin {
  id: string;
  scopeType: "chat" | "persona";
  scopeId: string;
  imagePath: string;
  caption: string;
  category: BoardPinCategory;
  inScene: boolean;
  order: number;
  createdAt?: string;
}

export type BoardScope = { scopeType: "chat" | "persona"; scopeId: string } | null;

export const boardKeys = {
  pins: (scope: BoardScope) => ["fork-board", scope?.scopeType ?? "none", scope?.scopeId ?? "none"] as const,
};

export function useBoardPins(scope: BoardScope) {
  return useQuery({
    queryKey: boardKeys.pins(scope),
    queryFn: () =>
      api.get<BoardPin[]>(
        `/fork-board/pins?scopeType=${scope!.scopeType}&scopeId=${encodeURIComponent(scope!.scopeId)}`,
      ),
    enabled: Boolean(scope?.scopeId),
    staleTime: 60_000,
  });
}

export function useAddBoardPin(scope: BoardScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; caption?: string; category?: BoardPinCategory }) => {
      const form = new FormData();
      form.append("scopeType", scope!.scopeType);
      form.append("scopeId", scope!.scopeId);
      if (input.caption) form.append("caption", input.caption);
      if (input.category) form.append("category", input.category);
      form.append("file", input.file);
      return api.upload<BoardPin>("/fork-board/pins", form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.pins(scope) }),
  });
}

export function useUpdateBoardPin(scope: BoardScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      caption?: string;
      category?: BoardPinCategory;
      inScene?: boolean;
      order?: number;
    }) => api.patch<BoardPin>(`/fork-board/pins/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.pins(scope) }),
  });
}

export function useDeleteBoardPin(scope: BoardScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-board/pins/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.pins(scope) }),
  });
}
