// ──────────────────────────────────────────────
// Fork: the weather panel's choices (see FORK.md)
// ──────────────────────────────────────────────
// Weather picks are remembered per chat; the sound switches are one browser preference. Kept in
// its own small store rather than in ui.store, so the fork touches one less upstream file.
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_WEATHER_PREFS, type WeatherPrefs } from "../lib/fork/weather-prefs";

interface ForkWeatherState {
  byChat: Record<string, Partial<WeatherPrefs>>;
  soundOn: boolean;
  volume: number;
  fireplace: boolean;
  setChatPrefs: (chatId: string, patch: Partial<WeatherPrefs>) => void;
  resetChatPrefs: (chatId: string) => void;
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
      setChatPrefs: (chatId, patch) =>
        set((state) => ({ byChat: { ...state.byChat, [chatId]: { ...state.byChat[chatId], ...patch } } })),
      resetChatPrefs: (chatId) =>
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

/** One chat's weather choices, with the defaults filled in. */
export function useChatWeatherPrefs(chatId: string | null): WeatherPrefs {
  const stored = useForkWeatherStore((state) => (chatId ? state.byChat[chatId] : undefined));
  // Memoised on content: the weather canvas restarts whenever its config changes identity, and
  // tapping an already-chosen chip saves an equal but new object.
  const key = stored ? JSON.stringify(stored) : "";
  return useMemo(
    () => (key ? { ...DEFAULT_WEATHER_PREFS, ...(JSON.parse(key) as Partial<WeatherPrefs>) } : DEFAULT_WEATHER_PREFS),
    [key],
  );
}
