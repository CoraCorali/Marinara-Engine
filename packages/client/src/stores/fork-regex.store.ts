// ──────────────────────────────────────────────
// Fork: display regexes that wait until a reply has finished (see FORK.md)
// ──────────────────────────────────────────────
// A per-script browser preference, kept apart from the regex scripts themselves so the fork adds no
// column to Marinara's own table (and no storage-format change).
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ForkRegexState {
  /** Scripts that skip a reply while it is still streaming. */
  waitForFinish: string[];
  setWaitForFinish: (scriptId: string, wait: boolean) => void;
}

export const useForkRegexStore = create<ForkRegexState>()(
  persist(
    (set) => ({
      waitForFinish: [],
      setWaitForFinish: (scriptId, wait) =>
        set((state) => ({
          waitForFinish: wait
            ? Array.from(new Set([...state.waitForFinish, scriptId]))
            : state.waitForFinish.filter((id) => id !== scriptId),
        })),
    }),
    { name: "marinara-fork-regex", storage: createJSONStorage(() => localStorage) },
  ),
);
