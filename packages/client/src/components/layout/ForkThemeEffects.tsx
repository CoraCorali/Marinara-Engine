// ──────────────────────────────────────────────
// Fork: applies the theme effect switches to the page (see FORK.md)
// ──────────────────────────────────────────────
import { useEffect, useMemo } from "react";
import { parseThemeEffects, themeEffectsOffAttribute } from "../../lib/fork/theme-effects";
import { useForkWeatherStore } from "../../stores/fork-weather.store";

/** Renders nothing; keeps <html data-fork-fx-off> in step with the switches and the active theme. */
export function ForkThemeEffects({ css }: { css: string | null | undefined }) {
  const choices = useForkWeatherStore((state) => state.themeEffects);
  const effects = useMemo(() => parseThemeEffects(css), [css]);
  const off = themeEffectsOffAttribute(effects, choices);
  useEffect(() => {
    const root = document.documentElement;
    if (off) root.setAttribute("data-fork-fx-off", off);
    else root.removeAttribute("data-fork-fx-off");
    return () => root.removeAttribute("data-fork-fx-off");
  }, [off]);
  return null;
}
