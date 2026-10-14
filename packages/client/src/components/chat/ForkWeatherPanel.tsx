// ──────────────────────────────────────────────
// Fork: the weather panel — pick the weather, tune it, and hear it
// ──────────────────────────────────────────────
import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { HelpTooltip } from "../ui/HelpTooltip";
import { cn } from "../../lib/utils";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import { WeatherSoundEngine } from "../../lib/fork/weather-sound";
import { FORK_SWITCH_CLASS } from "../../lib/fork/switch";
import { isTrackerFieldLocked, worldTrackerLockKey } from "@marinara-engine/shared";
import {
  WEATHER_PICKS,
  WORLD_TIME_FOR,
  timeOfDayFor,
  weatherPickFor,
  worldWeatherFor,
  type WeatherPrefs,
  type WeatherSoundScene,
} from "../../lib/fork/weather-prefs";
import { patchGameStateField } from "../../hooks/use-game-state-patcher";
import { useThemes } from "../../hooks/use-themes";
import { isThemeEffectOn, parseThemeEffects } from "../../lib/fork/theme-effects";
import { useGameStateStore } from "../../stores/game-state.store";

const WORLD_TIMES = ["dawn", "day", "dusk", "night"] as const;
import { useChatWeatherPrefs, useForkWeatherStore } from "../../stores/fork-weather.store";

const CHIP =
  "flex min-h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40";
const CHIP_ON = "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] text-foreground";
const CHIP_OFF = "border-[var(--border)] text-foreground/80 hover:bg-foreground/10";

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">
        {title}
        {help && <HelpTooltip buttonClassName="-m-2 p-2" text={help} wide />}
      </h3>
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
        className="h-9 min-w-0 flex-1 accent-[var(--primary)]"
      />
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--muted-foreground)]">
        {Math.round(draft * 100)}%
      </span>
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-9 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-[0.8125rem] font-semibold text-foreground">
      {label}
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={FORK_SWITCH_CLASS}
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
  // The active theme's own effects, each with a switch (one setting for every chat).
  const { data: themes = [] } = useThemes();
  const activeThemeCss = themes.find((theme) => theme.isActive)?.css ?? null;
  const themeEffects = useMemo(() => parseThemeEffects(activeThemeCss), [activeThemeCss]);
  const themeChoices = useForkWeatherStore((s) => s.themeEffects);
  const setThemeEffect = useForkWeatherStore((s) => s.setThemeEffect);

  // The story's own weather and time, from the world state the tracker shows.
  const story = useGameStateStore((state) => (state.current && state.current.chatId === chatId ? state.current : null));
  const storyWeather = story?.weather ?? null;
  const storyTime = story?.time ?? null;
  const currentPick = weatherPickFor(storyWeather);
  const currentTime = timeOfDayFor(storyTime);
  const lockKeys = [worldTrackerLockKey("weather"), worldTrackerLockKey("time")];
  const kept = lockKeys.every((key) => isTrackerFieldLocked(story?.fieldLocks, key));
  const setWorld = (field: "weather" | "time", value: string) => chatId && patchGameStateField(chatId, field, value);
  const setKept = (on: boolean) => {
    if (!chatId) return;
    const next = { ...(story?.fieldLocks ?? {}) };
    for (const key of lockKeys) {
      if (on) next[key] = true;
      else delete next[key];
    }
    patchGameStateField(chatId, "fieldLocks", next);
  };

  // A pick saved by the older panel only changed the picture; it moves into the story once.
  useEffect(() => {
    if (!chatId) return;
    const patch: Partial<WeatherPrefs> = {};
    if (!prefs.follow) {
      patchGameStateField(chatId, "weather", worldWeatherFor(prefs.pick));
      patch.follow = true;
    }
    if (prefs.time !== "story") {
      patchGameStateField(chatId, "time", WORLD_TIME_FOR[prefs.time]);
      patch.time = "story";
    }
    if (Object.keys(patch).length > 0) setChatPrefs(chatId, patch);
  }, [chatId, prefs.follow, prefs.pick, prefs.time, setChatPrefs]);

  if (!chatId)
    return (
      <p className="text-[0.8125rem] text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkweather.noChat")}</p>
    );

  return (
    <div className="fork-ui flex flex-col gap-4">
      {/* The weather and time live in the story's world state, so the tracker, the writer and the
          screen all agree. A chip here writes the world state; the story can change it on a later
          reply unless "Keep it this way" holds it with the tracker's own field locks. */}
      <Section title={localizeUi("ui.chat.forkweather.weather")} help={localizeUi("ui.chat.forkweather.worldHelp")}>
        <p className="rounded-xl bg-[var(--secondary)] px-3 py-2 text-xs text-foreground/85">
          <span className="font-semibold text-[var(--primary)]">{localizeUi("ui.chat.forkweather.inTheStory")} </span>
          {[storyWeather || localizeUi("ui.chat.forkweather.noWeatherYet"), storyTime].filter(Boolean).join(" · ")}
        </p>
        <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3">
          {WEATHER_PICKS.map((pick) => (
            <button
              key={pick.id}
              type="button"
              onClick={() => setWorld("weather", worldWeatherFor(pick.id))}
              aria-pressed={currentPick === pick.id}
              className={cn(CHIP, "justify-start", currentPick === pick.id ? CHIP_ON : CHIP_OFF)}
            >
              <span aria-hidden="true">{pick.emoji}</span>
              {localizeUi(`ui.chat.forkweather.pick.${pick.id}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={localizeUi("ui.chat.forkweather.time")}>
        <div className="flex flex-wrap gap-1.5">
          {WORLD_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => setWorld("time", WORLD_TIME_FOR[time])}
              aria-pressed={currentTime === time}
              className={cn(CHIP, currentTime === time ? CHIP_ON : CHIP_OFF)}
            >
              {localizeUi(`ui.chat.forkweather.timeOption.${time}`)}
            </button>
          ))}
        </div>
        <Switch label={localizeUi("ui.chat.forkweather.keepIt")} checked={kept} onChange={setKept} />
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
            className="h-9 w-16 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent"
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

      {themeEffects.length > 0 && (
        <Section
          title={localizeUi("ui.chat.forkweather.themeEffects")}
          help={localizeUi("ui.chat.forkweather.themeEffectsHelp")}
        >
          {(["roleplay", "everywhere"] as const).map((where) => {
            const group = themeEffects.filter((effect) => effect.where === where);
            if (group.length === 0) return null;
            return (
              <div key={where} className="flex flex-col gap-1.5">
                <p className="text-[0.6875rem] font-semibold text-[var(--muted-foreground)]">
                  {localizeUi(
                    where === "roleplay" ? "ui.chat.forkweather.inRoleplay" : "ui.chat.forkweather.everywhere",
                  )}
                </p>
                {group.map((effect) => (
                  <Switch
                    key={effect.id}
                    label={effect.label}
                    checked={isThemeEffectOn(effect, themeChoices)}
                    onChange={(on) => setThemeEffect(effect.id, on)}
                  />
                ))}
              </div>
            );
          })}
        </Section>
      )}

      <Section title={localizeUi("ui.chat.forkweather.sounds")} help={localizeUi("ui.chat.forkweather.soundHelp")}>
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
      </Section>

      <button
        type="button"
        onClick={() => resetChatPrefs(chatId)}
        className="flex min-h-9 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] text-[0.8125rem] font-semibold text-foreground"
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
    // Browsers keep audio suspended until the page is touched. A touch counts only once the finger
    // lifts, and a key press counts too, so each of those wakes it.
    const wake = () => engine.resume();
    const wakeEvents = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
    const onVisibility = () => engine.setHidden(document.hidden);
    for (const name of wakeEvents) window.addEventListener(name, wake);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      for (const name of wakeEvents) window.removeEventListener(name, wake);
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
