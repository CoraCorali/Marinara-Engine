// ──────────────────────────────────────────────
// Fork: Reference board pins (React Query)
// ──────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ForkPinDetails, ForkPinShows, ForkPlaceLook, ForkWearSlot } from "@marinara-engine/shared";
import { toast } from "sonner";
import { api } from "../lib/api-client";
import { translate } from "../localization/i18n";

export const BOARD_PIN_CATEGORIES = ["wearing", "place", "person", "thing", "vibe"] as const;
export type BoardPinCategory = (typeof BOARD_PIN_CATEGORIES)[number];

export interface BoardPin {
  id: string;
  scopeType: "chat" | "persona" | "outfit";
  scopeId: string;
  imagePath: string;
  caption: string;
  category: BoardPinCategory;
  inScene: boolean;
  /** "persona", a character id, "scene", or "" when nobody said. */
  who: string;
  /** For a wearing pin, what it covers. */
  slot: ForkWearSlot | "";
  shows: ForkPinShows;
  /** A place's building, a thing's or person's name, a vibe's title. */
  name: string;
  /** What the pin's category knows beyond the picture. */
  details: ForkPinDetails;
  order: number;
  createdAt?: string;
}

/** What "Describe it" suggests for a pin. Nothing is saved until the board keeps it. */
export interface PinDescription {
  caption: string;
  category: BoardPinCategory;
  slot: ForkWearSlot | "";
  shows: ForkPinShows;
  name: string;
  palette: string[];
  words: string[];
}

/** A chat's board, a persona's always-on board, or one outfit in the closet. */
export type BoardScope = { scopeType: "chat" | "persona" | "outfit"; scopeId: string } | null;

export const boardKeys = {
  pins: (scope: BoardScope) => ["fork-board", scope?.scopeType ?? "none", scope?.scopeId ?? "none"] as const,
};

const closetKey = ["fork-closet"] as const;

/** Re-read a scope's pins; an outfit's pieces also live in the closet's list. */
function invalidateScope(qc: ReturnType<typeof useQueryClient>, scope: BoardScope) {
  void qc.invalidateQueries({ queryKey: boardKeys.pins(scope) });
  if (scope?.scopeType === "outfit") void qc.invalidateQueries({ queryKey: closetKey });
}

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
    onSuccess: () => invalidateScope(qc, scope),
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
      who?: string;
      slot?: ForkWearSlot | "";
      shows?: ForkPinShows;
      name?: string;
      /** Merged into the pin's details: a key set to null or "" clears it. */
      details?: Partial<Record<keyof ForkPinDetails, unknown>>;
    }) => api.patch<BoardPin>(`/fork-board/pins/${id}`, data),
    // Captions, categories, in-scene and order all save through here; a failure says so once,
    // instead of the change quietly snapping back on the next read.
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error && error.message ? error.message : translate("ui.chat.forkboard.couldNotSave"),
        { id: "fork-board-save" },
      ),
    onSuccess: () => invalidateScope(qc, scope),
  });
}

export function useDeleteBoardPin(scope: BoardScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-board/pins/${id}`),
    onSuccess: () => invalidateScope(qc, scope),
  });
}

/** One more picture of a place, for day, night or rain. */
export function useAddAlbumPicture(scope: BoardScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, look }: { id: string; file: File; look: ForkPlaceLook | "" }) => {
      const form = new FormData();
      form.append("look", look);
      form.append("file", file);
      return api.upload<BoardPin>(`/fork-board/pins/${id}/album`, form);
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error && error.message ? error.message : translate("ui.chat.forkboard.couldNotSave"),
      ),
    onSuccess: () => invalidateScope(qc, scope),
  });
}

export function useRemoveAlbumPicture(scope: BoardScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, path }: { id: string; path: string }) =>
      api.delete<BoardPin>(`/fork-board/pins/${id}/album?path=${encodeURIComponent(path)}`),
    onSuccess: () => invalidateScope(qc, scope),
  });
}

/** "Describe it": the chat's model looks at the picture and suggests a caption and what it is. */
export function useDescribeBoardPin() {
  return useMutation({
    mutationFn: ({ id, chatId, debugMode }: { id: string; chatId: string | null; debugMode?: boolean }) =>
      api.post<PinDescription>(`/fork-board/pins/${id}/describe`, { chatId, debugMode }),
  });
}

// ── The closet: saved outfits for any chat ──

export interface ClosetOutfit {
  id: string;
  name: string;
  order: number;
  pieces: BoardPin[];
}

function closetSaveFailed(error: unknown) {
  toast.error(error instanceof Error && error.message ? error.message : translate("ui.chat.forkcloset.couldNotSave"), {
    id: "fork-closet-save",
  });
}

export function useClosetOutfits(enabled = true) {
  return useQuery({
    queryKey: closetKey,
    queryFn: () => api.get<ClosetOutfit[]>("/fork-closet/outfits"),
    enabled,
    staleTime: 30_000,
  });
}

/** A new outfit, empty or holding copies of the given pins. */
export function useCreateOutfit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; pinIds?: string[] }) => api.post<ClosetOutfit>("/fork-closet/outfits", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: closetKey }),
    onError: closetSaveFailed,
  });
}

export function useRenameOutfit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<ClosetOutfit>(`/fork-closet/outfits/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: closetKey }),
    onError: closetSaveFailed,
  });
}

export function useDeleteOutfit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/fork-closet/outfits/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: closetKey }),
    onError: closetSaveFailed,
  });
}

/** Put an outfit on someone in a chat: its pieces join the chat's board, in scene. */
export function useWearOutfit(chatId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, who }: { id: string; who: string }) =>
      api.post<BoardPin[]>(`/fork-closet/outfits/${id}/wear`, { chatId, who }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: boardKeys.pins(chatId ? { scopeType: "chat", scopeId: chatId } : null) }),
    onError: closetSaveFailed,
  });
}
