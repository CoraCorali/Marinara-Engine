// ──────────────────────────────────────────────
// Fork: a soft wash of light that follows the story's time of day (see FORK.md)
// ──────────────────────────────────────────────
import { useGameStateStore } from "../../stores/game-state.store";
import { useChatStore } from "../../stores/chat.store";
import { useChatWeatherPrefs } from "../../stores/fork-weather.store";
import { useEffect, useState } from "react";
import {
  STORY_LIGHT_PHASES,
  STORY_LIGHT_WASH,
  storyLightPhase,
  type StoryLightPhase,
} from "../../lib/fork/story-light";

/**
 * The current phase's wash, and during a change the one it is fading from: a phase change
 * crossfades over 20 seconds by opacity alone. Only one or two layers exist at a time, since each
 * blends with everything under it, the weather canvas included, on every frame it draws. With
 * reduced motion it switches at once.
 */
export function ForkStoryLight() {
  const chatId = useChatStore((s) => s.activeChatId);
  const prefs = useChatWeatherPrefs(chatId);
  const time = useGameStateStore((s) => (s.current && s.current.chatId === chatId ? s.current.time : null));
  const phase = prefs.light ? storyLightPhase(time) : null;
  const [fading, setFading] = useState<StoryLightPhase | null>(null);
  const [shown, setShown] = useState<StoryLightPhase | null>(phase);
  // A new phase starts at 0 and rises next frame, so its fade runs; the old one falls and then goes.
  useEffect(() => {
    if (phase === shown) return;
    setFading(shown);
    setShown(null);
    const rise = requestAnimationFrame(() => setShown(phase));
    const done = window.setTimeout(() => setFading(null), FADE_MS);
    return () => {
      cancelAnimationFrame(rise);
      window.clearTimeout(done);
    };
    // Only a change of phase starts a fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  const layers = STORY_LIGHT_PHASES.filter((entry) => entry === phase || entry === fading);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1]"
      data-fork-story-light={phase ?? "off"}
    >
      {layers.map((entry) => (
        <div
          key={entry}
          className="absolute inset-0 mix-blend-soft-light transition-opacity duration-[20000ms] ease-in-out motion-reduce:transition-none"
          style={{ backgroundImage: STORY_LIGHT_WASH[entry], opacity: entry === shown ? 0.7 : 0 }}
        />
      ))}
    </div>
  );
}

const FADE_MS = 20_000;
