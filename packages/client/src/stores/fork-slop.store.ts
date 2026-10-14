// ──────────────────────────────────────────────
// Fork: the slop highlighter's settings (see FORK.md)
// ──────────────────────────────────────────────
// Kept in its own small store rather than in ui.store, so the fork touches one less upstream file.
// A browser preference, like the rest of the reading settings.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SLOP_PHRASES } from "../lib/fork/slop";

interface ForkSlopState {
  /** Mark the listed phrases in replies. */
  highlight: boolean;
  phrases: string[];
  /** Show Marinara's own "Add to lorebook" under a selection. */
  lorebookButton: boolean;
  /** The list editor is open. Not persisted. */
  listOpen: boolean;
  setHighlight: (highlight: boolean) => void;
  setLorebookButton: (lorebookButton: boolean) => void;
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
      listOpen: false,
      setHighlight: (highlight) => set({ highlight }),
      setLorebookButton: (lorebookButton) => set({ lorebookButton }),
      setPhrases: (phrases) => set({ phrases }),
      resetPhrases: () => set({ phrases: [...DEFAULT_SLOP_PHRASES] }),
      setListOpen: (listOpen) => set({ listOpen }),
    }),
    {
      name: "marinara-fork-slop",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        highlight: state.highlight,
        phrases: state.phrases,
        lorebookButton: state.lorebookButton,
      }),
    },
  ),
);
