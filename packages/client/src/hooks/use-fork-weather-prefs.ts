// ──────────────────────────────────────────────
// Fork: a chat's weather choices, saved with the chat (see FORK.md)
// ──────────────────────────────────────────────
// Saved in the chat's metadata as `forkWeather`, so a chat looks the same on every device. A
// slider being dragged saves once it settles; until then the choice shows from memory.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { DEFAULT_WEATHER_PREFS, type WeatherPrefs } from "../lib/fork/weather-prefs";
import { useForkWeatherStore } from "../stores/fork-weather.store";
import { useChat, useUpdateChatMetadata } from "./use-chats";

const SAVE_AFTER_MS = 500;

function savedPrefs(metadata: unknown): Partial<WeatherPrefs> | null {
  let meta = metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      return null;
    }
  }
  const value = meta && typeof meta === "object" ? (meta as Record<string, unknown>).forkWeather : null;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<WeatherPrefs>) : null;
}

/** One chat's weather choices, with the defaults filled in. */
export function useChatWeatherPrefs(chatId: string | null): WeatherPrefs {
  const { data: chat } = useChat(chatId);
  const saved = savedPrefs(chat?.metadata);
  const legacy = useForkWeatherStore((state) => (chatId ? state.byChat[chatId] : undefined));
  const pending = useForkWeatherStore((state) => (chatId ? state.pending[chatId] : undefined));
  // Memoised on content: the weather canvas restarts whenever its config changes identity.
  const key = JSON.stringify([legacy ?? null, saved, pending ?? null]);
  return useMemo(() => {
    const [older, onChat, unsaved] = JSON.parse(key) as Partial<WeatherPrefs>[];
    return { ...DEFAULT_WEATHER_PREFS, ...older, ...onChat, ...unsaved };
  }, [key]);
}

/** Changes a chat's weather choices, and puts back the defaults. */
export function useSetChatWeatherPrefs(chatId: string | null) {
  const { data: chat } = useChat(chatId);
  const update = useUpdateChatMetadata();
  const savedRef = useRef<Partial<WeatherPrefs> | null>(null);
  savedRef.current = savedPrefs(chat?.metadata);
  const timer = useRef<number | undefined>(undefined);
  const mutate = update.mutate;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (!chatId) return;
    const store = useForkWeatherStore.getState();
    const pending = store.pending[chatId];
    const legacy = store.byChat[chatId];
    if (!pending && !legacy) return;
    const next = { ...legacy, ...savedRef.current, ...pending };
    mutate(
      { id: chatId, forkWeather: next },
      {
        onSuccess: () => {
          useForkWeatherStore.getState().settlePending(chatId, next);
          useForkWeatherStore.getState().dropLegacy(chatId);
        },
      },
    );
  }, [chatId, mutate]);

  // Choices kept only in this browser move into the chat once; a pending save is not lost on close.
  useEffect(() => {
    if (chatId && useForkWeatherStore.getState().byChat[chatId]) flush();
    return flush;
  }, [chatId, flush]);

  const set = useCallback(
    (patch: Partial<WeatherPrefs>) => {
      if (!chatId) return;
      useForkWeatherStore.getState().setPending(chatId, patch);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_AFTER_MS);
    },
    [chatId, flush],
  );

  const reset = useCallback(() => {
    if (!chatId) return;
    window.clearTimeout(timer.current);
    useForkWeatherStore.getState().clearPending(chatId);
    useForkWeatherStore.getState().dropLegacy(chatId);
    mutate({ id: chatId, forkWeather: null });
  }, [chatId, mutate]);

  return { set, reset };
}
