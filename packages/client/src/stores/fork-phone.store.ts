// ──────────────────────────────────────────────
// Fork: which phone screen is open (see FORK.md)
// ──────────────────────────────────────────────
import { create } from "zustand";

interface ForkPhoneState {
  /** null when the phone is closed; "home" for the thread list; a side for one conversation. */
  openTo: string | null;
  setOpenTo: (to: string | null) => void;
}

export const useForkPhoneStore = create<ForkPhoneState>()((set) => ({
  openTo: null,
  setOpenTo: (openTo) => set({ openTo }),
}));
