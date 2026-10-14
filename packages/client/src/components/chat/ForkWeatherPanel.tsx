// ──────────────────────────────────────────────
// Fork: the weather panel — pick the weather, tune it, and hear it
// ──────────────────────────────────────────────
import { useEffect, useId, useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import { WeatherSoundEngine } from "../../lib/fork/weather-sound";
import { WEATHER_PICKS, WEATHER_TIMES, type WeatherPrefs, type WeatherSoundScene } from "../../lib/fork/weather-prefs";
import { useChatWeatherPrefs, useForkWeatherStore } from "../../stores/fork-weather.store";

const CHIP =
  "flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40";
const CHIP_ON = "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] text-foreground";
const CHIP_OFF = "border-[var(--border)] text-foreground/80 hover:bg-foreground/10";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">{title}</h3>
      {children}
    </section>
  );
}

/** A slider that saves where it is let go, so dragging it does not restart the weather every step. */
function Slider({
  label,
  value,
  min,
  max,
  step = 0.05,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, change, flush] = useForkDraftField(value, onCommit, 400);
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-xs font-semibold text-foreground/85">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => change(Number(event.target.value))}
        onPointerUp={flush}
        onKeyUp={flush}
        className="h-11 min-w-0 flex-1 accent-[var(--primary)]"
      />
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--muted-foreground)]">
        {Math.round(draft * 100)}%
      </span>
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-sm font-semibold text-foreground">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[var(--primary)]"
      />
    </label>
  );
}

export function ForkWeatherPanel({ chatId }: { chatId: string | null }) {
  const { t: localizeUi } = useUiTranslation();
  const prefs = useChatWeatherPrefs(chatId);
  const setChatPrefs = useForkWeatherStore((s) => s.setChatPrefs);
  const resetChatPrefs = useForkWeatherStore((s) => s.resetChatPrefs);
  const soundOn = useForkWeatherStore((s) => s.soundOn);
  const volume = useForkWeatherStore((s) => s.volume);
  const fireplace = useForkWeatherStore((s) => s.fireplace);
  const setSoundOn = useForkWeatherStore((s) => s.setSoundOn);
  const setVolume = useForkWeatherStore((s) => s.setVolume);
  const setFireplace = useForkWeatherStore((s) => s.setFireplace);
  const set = (patch: Partial<WeatherPrefs>) => chatId && setChatPrefs(chatId, patch);
  const tintId = useId();

  if (!chatId)
    return <p className="text-sm text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkweather.noChat")}</p>;

  return (
    <div className="flex flex-col gap-5">
      <Section title={localizeUi("ui.chat.forkweather.weather")}>
        <div className="flex rounded-full bg-[var(--secondary)] p-1 text-xs font-bold">
          {[true, false].map((follow) => (
            <button
              key={String(follow)}
              type="button"
              onClick={() => set({ follow })}
              aria-pressed={prefs.follow === follow}
              className={cn(
                "min-h-10 flex-1 rounded-full px-3 transition-colors",
                prefs.follow === follow ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-foreground/70",
              )}
            >
              {localizeUi(follow ? "ui.chat.forkweather.followStory" : "ui.chat.forkweather.pickMyself")}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3">
          {WEATHER_PICKS.map((pick) => (
            <button
              key={pick.id}
              type="button"
              disabled={prefs.follow}
              onClick={() => set({ pick: pick.id })}
              aria-pressed={!prefs.follow && prefs.pick === pick.id}
              className={cn(CHIP, "justify-start", !prefs.follow && prefs.pick === pick.id ? CHIP_ON : CHIP_OFF)}
            >
              <span aria-hidden="true">{pick.emoji}</span>
              {localizeUi(`ui.chat.forkweather.pick.${pick.id}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={localizeUi("ui.chat.forkweather.time")}>
        <div className="flex flex-wrap gap-1.5">
          {WEATHER_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => set({ time })}
              aria-pressed={prefs.time === time}
              className={cn(CHIP, prefs.time === time ? CHIP_ON : CHIP_OFF)}
            >
              {localizeUi(`ui.chat.forkweather.timeOption.${time}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={localizeUi("ui.chat.forkweather.tune")}>
        <Slider
          label={localizeUi("ui.chat.forkweather.amount")}
          value={prefs.amount}
          min={0.2}
          max={2.5}
          onCommit={(amount) => set({ amount })}
        />
        <Slider
          label={localizeUi("ui.chat.forkweather.speed")}
          value={prefs.speed}
          min={0.3}
          max={2.5}
          onCommit={(speed) => set({ speed })}
        />
        <Slider
          label={localizeUi("ui.chat.forkweather.size")}
          value={prefs.size}
          min={0.4}
          max={2.5}
          onCommit={(size) => set({ size })}
        />
        <Slider
          label={localizeUi("ui.chat.forkweather.opacity")}
          value={prefs.opacity}
          min={0.1}
          max={1}
          onCommit={(opacity) => set({ opacity })}
        />
        <Slider
          label={localizeUi("ui.chat.forkweather.brightness")}
          value={prefs.brightness}
          min={0.5}
          max={1.6}
          onCommit={(brightness) => set({ brightness })}
        />
        <div className="flex items-center gap-3">
          <label htmlFor={tintId} className="w-24 shrink-0 text-xs font-semibold text-foreground/85">
            {localizeUi("ui.chat.forkweather.tint")}
          </label>
          <input
            id={tintId}
            type="color"
            value={prefs.tint || "#5b7cfa"}
            onChange={(event) => set({ tint: event.target.value })}
            className="h-11 w-16 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent"
          />
          <button
            type="button"
            onClick={() => set({ tint: "" })}
            aria-pressed={!prefs.tint}
            className={cn(CHIP, !prefs.tint ? CHIP_ON : CHIP_OFF)}
          >
            {localizeUi("ui.chat.forkweather.noTint")}
          </button>
        </div>
      </Section>

      <Section title={localizeUi("ui.chat.forkweather.sky")}>
        <Switch
          label={localizeUi("ui.chat.forkweather.stars")}
          checked={prefs.stars}
          onChange={(stars) => set({ stars })}
        />
        <Switch
          label={localizeUi("ui.chat.forkweather.aurora")}
          checked={prefs.aurora}
          onChange={(aurora) => set({ aurora })}
        />
        <div className="flex flex-wrap gap-1.5">
          {(["auto", "manual", "hide"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set({ celestial: mode })}
              aria-pressed={prefs.celestial === mode}
              className={cn(CHIP, prefs.celestial === mode ? CHIP_ON : CHIP_OFF)}
            >
              {localizeUi(`ui.chat.forkweather.celestial.${mode}`)}
            </button>
          ))}
        </div>
        {prefs.celestial === "manual" && (
          <Slider
            label={localizeUi("ui.chat.forkweather.celestialPosition")}
            value={prefs.celestialX}
            min={0}
            max={1}
            onCommit={(celestialX) => set({ celestialX })}
          />
        )}
      </Section>

      <Section title={localizeUi("ui.chat.forkweather.sounds")}>
        <Switch label={localizeUi("ui.chat.forkweather.soundOn")} checked={soundOn} onChange={setSoundOn} />
        {soundOn && (
          <>
            <Slider
              label={localizeUi("ui.chat.forkweather.volume")}
              value={volume}
              min={0}
              max={1}
              onCommit={setVolume}
            />
            <Switch label={localizeUi("ui.chat.forkweather.fireplace")} checked={fireplace} onChange={setFireplace} />
          </>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkweather.soundHelp")}</p>
      </Section>

      <button
        type="button"
        onClick={() => resetChatPrefs(chatId)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] text-sm font-semibold text-foreground"
      >
        <RotateCcw size="0.875rem" />
        {localizeUi("ui.chat.forkweather.reset")}
      </button>
    </div>
  );
}

/** Plays the weather's soundscape while sounds are on. Renders nothing. */
export function ForkWeatherSound({ scene }: { scene: WeatherSoundScene }) {
  const soundOn = useForkWeatherStore((s) => s.soundOn);
  const volume = useForkWeatherStore((s) => s.volume);
  const engineRef = useRef<WeatherSoundEngine | null>(null);

  useEffect(() => {
    if (!soundOn) return;
    const engine = WeatherSoundEngine.create();
    if (!engine) return;
    engineRef.current = engine;
    engine.resume();
    // Browsers keep audio suspended until the page is touched, so any touch wakes it.
    const wake = () => engine.resume();
    const onVisibility = () => engine.setHidden(document.hidden);
    window.addEventListener("pointerdown", wake);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", wake);
      document.removeEventListener("visibilitychange", onVisibility);
      engine.close();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [soundOn]);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume, soundOn]);

  useEffect(() => {
    engineRef.current?.setScene({ rain: scene.rain, wind: scene.wind, thunder: scene.thunder, crackle: scene.crackle });
  }, [scene.rain, scene.wind, scene.thunder, scene.crackle, soundOn]);

  return null;
}
