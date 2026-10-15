// ──────────────────────────────────────────────
// Fork: the weather panel's choices (see FORK.md)
// ──────────────────────────────────────────────
// A chat's weather choices are saved with the chat (see use-fork-weather-prefs); this store holds
// the ones being saved, and older choices that were kept only in this browser until they move
// over. The sound switches and theme effects are one browser preference for every chat. Kept in
// its own small store rather than in ui.store, so the fork touches one less upstream file.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { WeatherPrefs } from "../lib/fork/weather-prefs";

interface ForkWeatherState {
  /** Choices from before they were saved with the chat; moved over once, then dropped. */
  byChat: Record<string, Partial<WeatherPrefs>>;
  /** Choices made in the last moment and not yet saved with the chat. Not kept. */
  pending: Record<string, Partial<WeatherPrefs>>;
  setPending: (chatId: string, patch: Partial<WeatherPrefs>) => void;
  /** Forgets pending choices that were saved, keeping any made since. */
  settlePending: (chatId: string, saved: Partial<WeatherPrefs>) => void;
  clearPending: (chatId: string) => void;
  dropLegacy: (chatId: string) => void;
  soundOn: boolean;
  volume: number;
  fireplace: boolean;
  setSoundOn: (on: boolean) => void;
  setVolume: (volume: number) => void;
  setFireplace: (on: boolean) => void;
  /** Whether the panel is open, so the tracker's weather tile can open it too. Not saved. */
  panelOpen: boolean;
  /** Set while a roleplay chat that has the panel is on screen. Not saved. */
  panelAvailable: boolean;
  setPanelOpen: (open: boolean) => void;
  setPanelAvailable: (available: boolean) => void;
  /** The theme effect switches the viewer flipped, by effect id. One setting for every chat. */
  themeEffects: Record<string, boolean>;
  setThemeEffect: (id: string, on: boolean) => void;
}

export const useForkWeatherStore = create<ForkWeatherState>()(
  persist(
    (set) => ({
      byChat: {},
      soundOn: false,
      volume: 0.5,
      fireplace: false,
      pending: {},
      setPending: (chatId, patch) =>
        set((state) => ({ pending: { ...state.pending, [chatId]: { ...state.pending[chatId], ...patch } } })),
      settlePending: (chatId, saved) =>
        set((state) => {
          const left = Object.fromEntries(
            Object.entries(state.pending[chatId] ?? {}).filter(
              ([key, value]) => JSON.stringify(value) !== JSON.stringify((saved as Record<string, unknown>)[key]),
            ),
          );
          const next = { ...state.pending };
          if (Object.keys(left).length) next[chatId] = left;
          else delete next[chatId];
          return { pending: next };
        }),
      clearPending: (chatId) =>
        set((state) => {
          const next = { ...state.pending };
          delete next[chatId];
          return { pending: next };
        }),
      dropLegacy: (chatId) =>
        set((state) => {
          const next = { ...state.byChat };
          delete next[chatId];
          return { byChat: next };
        }),
      setSoundOn: (soundOn) => set({ soundOn }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setFireplace: (fireplace) => set({ fireplace }),
      panelOpen: false,
      panelAvailable: false,
      setPanelOpen: (panelOpen) => set({ panelOpen }),
      setPanelAvailable: (panelAvailable) => set({ panelAvailable }),
      themeEffects: {},
      setThemeEffect: (id, on) => set((state) => ({ themeEffects: { ...state.themeEffects, [id]: on } })),
    }),
    {
      name: "marinara-fork-weather",
      storage: createJSONStorage(() => localStorage),
      // Only the choices are remembered; whether the panel is open is not.
      partialize: (state) => ({
        byChat: state.byChat,
        soundOn: state.soundOn,
        volume: state.volume,
        fireplace: state.fireplace,
        themeEffects: state.themeEffects,
      }),
    },
  ),
);
