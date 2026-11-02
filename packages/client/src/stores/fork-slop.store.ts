// ──────────────────────────────────────────────
// Fork: the slop highlighter's settings (see FORK.md)
// ──────────────────────────────────────────────
// Kept in its own small store rather than in ui.store, so the fork touches one less upstream file.
// A browser preference, like the rest of the reading settings.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SLOP_PHRASES, UNDERTOW_SLOP_PHRASES, mergePhrases } from "../lib/fork/slop";

interface ForkSlopState {
  /** Mark the listed phrases in replies. */
  highlight: boolean;
  phrases: string[];
  /** Show Marinara's own "Add to lorebook" under a selection. */
  lorebookButton: boolean;
  /** Rewrite the sentences holding listed phrases as soon as a reply is done. */
  autoFix: boolean;
  /** The connection fixes use; null is the chat's own model. */
  fixConnectionId: string | null;
  /** The list editor is open. Not persisted. */
  listOpen: boolean;
  setHighlight: (highlight: boolean) => void;
  setLorebookButton: (lorebookButton: boolean) => void;
  setAutoFix: (autoFix: boolean) => void;
  setFixConnectionId: (fixConnectionId: string | null) => void;
  setPhrases: (phrases: string[]) => void;
  resetPhrases: () => void;
  setListOpen: (open: boolean) => void;
}

export const useForkSlopStore = create<ForkSlopState>()(
  persist(
    (set) => ({
      highlight: true,
      phrases: [...DEFAULT_SLOP_PHRASES],
      lorebookButton: true,
      autoFix: true,
      fixConnectionId: null,
      listOpen: false,
      setHighlight: (highlight) => set({ highlight }),
      setLorebookButton: (lorebookButton) => set({ lorebookButton }),
      setAutoFix: (autoFix) => set({ autoFix }),
      setFixConnectionId: (fixConnectionId) => set({ fixConnectionId }),
      setPhrases: (phrases) => set({ phrases }),
      resetPhrases: () => set({ phrases: [...DEFAULT_SLOP_PHRASES] }),
      setListOpen: (listOpen) => set({ listOpen }),
    }),
    {
      name: "marinara-fork-slop",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Version 1 made this the master list: Undertow's words join a saved list once, after the
      // writer's own phrases, and anything already on it is not added twice.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ForkSlopState>;
        if (version < 1 && Array.isArray(state.phrases))
          state.phrases = mergePhrases(state.phrases, UNDERTOW_SLOP_PHRASES);
        return state as ForkSlopState;
      },
      partialize: (state) => ({
        highlight: state.highlight,
        phrases: state.phrases,
        lorebookButton: state.lorebookButton,
        autoFix: state.autoFix,
        fixConnectionId: state.fixConnectionId,
      }),
    },
  ),
);
