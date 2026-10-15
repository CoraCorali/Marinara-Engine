// ──────────────────────────────────────────────
// Fork: the season where the story is (see FORK.md)
// ──────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import type { WeatherSeason } from "../lib/weather-renderer";
import { useForkWeatherStore } from "../stores/fork-weather.store";

/** The switches under "Cozy touches", one per season, as theme-effect ids. On unless switched off. */
export const SEASON_EFFECT_IDS: Record<WeatherSeason, string> = {
  spring: "fork-season-spring",
  summer: "fork-season-summer",
  autumn: "fork-season-autumn",
  winter: "fork-season-winter",
};

/**
 * Asks the server which season it is at the story's date and place. The server caches the answer
 * per place and month, so this costs a model call only when either changes. Undefined while it is
 * not known yet (the canvas then reads the month), null for "no season here" or a season switched off.
 */
export function useForkSeason(
  chatId: string | null,
  date: string | null,
  location: string | null,
): WeatherSeason | null | undefined {
  const choices = useForkWeatherStore((s) => s.themeEffects);
  const { data } = useQuery({
    queryKey: ["fork-season", chatId ?? "none", date ?? "", location ?? ""],
    queryFn: () => api.post<{ season: string | null }>(`/fork-weather/chats/${chatId}/season`, {}),
    enabled: Boolean(chatId && date?.trim()),
    staleTime: Infinity,
    retry: false,
  });
  if (!date?.trim()) return null;
  if (!data) return undefined;
  const season = (["spring", "summer", "autumn", "winter"] as const).find((entry) => entry === data.season) ?? null;
  return season && choices[SEASON_EFFECT_IDS[season]] !== false ? season : null;
}
