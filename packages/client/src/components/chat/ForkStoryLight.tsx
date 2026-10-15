// ──────────────────────────────────────────────
// Fork: a soft wash of light that follows the story's time of day (see FORK.md)
// ──────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useGameStateStore } from "../../stores/game-state.store";
import { useChatStore } from "../../stores/chat.store";
import { useChatWeatherPrefs } from "../../hooks/use-fork-weather-prefs";
import { effectiveWeatherInput } from "../../lib/fork/weather-prefs";
import { storyLightWash, storySky } from "../../lib/fork/story-light";

/** How strongly the wash shows: a hint of the hour, never a haze over the theme. */
const STORY_LIGHT_STRENGTH = 0.4;
const FADE_MS = 20_000;

/**
 * The wash for the sky the weather draws (the same weather and time, the weather panel's picks
 * included), and during a change the one it is fading from: it crossfades over 20 seconds by
 * opacity alone. Only one or two layers exist at a time, since each blends with everything under
 * it, the weather canvas included, on every frame it draws. With reduced motion it switches at once.
 */
export function ForkStoryLight() {
  const chatId = useChatStore((s) => s.activeChatId);
  const prefs = useChatWeatherPrefs(chatId);
  const storyWeather = useGameStateStore((s) => (s.current && s.current.chatId === chatId ? s.current.weather : null));
  const storyTime = useGameStateStore((s) => (s.current && s.current.chatId === chatId ? s.current.time : null));
  const { weather, time } = effectiveWeatherInput(prefs, { weather: storyWeather, time: storyTime });
  const sky = prefs.light ? storySky(weather, time, prefs.celestial === "manual" ? prefs.celestialX : null) : null;
  const wash = sky ? storyLightWash(sky) : null;
  const [fading, setFading] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(wash);
  // A new wash starts at 0 and rises next frame, so its fade runs; the old one falls and then goes.
  useEffect(() => {
    if (wash === shown) return;
    setFading(shown);
    setShown(null);
    const rise = requestAnimationFrame(() => setShown(wash));
    const done = window.setTimeout(() => setFading(null), FADE_MS);
    return () => {
      cancelAnimationFrame(rise);
      window.clearTimeout(done);
    };
    // Only a change of wash starts a fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wash]);
  const layers = [...new Set([fading, wash].filter((entry): entry is string => Boolean(entry)))];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1]"
      data-fork-story-light={sky ? `${sky.phase}${sky.clear ? "" : "-covered"}` : "off"}
    >
      {layers.map((entry) => (
        <div
          key={entry}
          className="absolute inset-0 mix-blend-soft-light transition-opacity duration-[20000ms] ease-in-out motion-reduce:transition-none"
          style={{ backgroundImage: entry, opacity: entry === shown ? STORY_LIGHT_STRENGTH : 0 }}
        />
      ))}
    </div>
  );
}
