// ──────────────────────────────────────────────
// Fork: opens the weather panel from the tracker's weather tile (see FORK.md)
// ──────────────────────────────────────────────
import { CloudSun } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { useForkWeatherStore } from "../../stores/fork-weather.store";

/** The weather in the tracker and the weather panel are the same weather, so one opens the other. */
export function ForkWeatherTileButton() {
  const { t: localizeUi } = useUiTranslation();
  const available = useForkWeatherStore((state) => state.panelAvailable);
  const setPanelOpen = useForkWeatherStore((state) => state.setPanelOpen);
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      aria-label={localizeUi("ui.chat.forkweather.openPanel")}
      title={localizeUi("ui.chat.forkweather.openPanel")}
      className="absolute bottom-0.5 left-0.5 z-[2] flex h-7 w-7 items-center justify-center rounded-full text-[var(--primary)] hover:bg-foreground/10"
    >
      <CloudSun size="0.875rem" />
    </button>
  );
}
