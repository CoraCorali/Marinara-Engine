// ──────────────────────────────────────────────
// Fork: a soft wash of light that follows the story's time of day (see FORK.md)
// ──────────────────────────────────────────────
import { useGameStateStore } from "../../stores/game-state.store";
import { useChatStore } from "../../stores/chat.store";
import { useChatWeatherPrefs } from "../../stores/fork-weather.store";
import { STORY_LIGHT_PHASES, STORY_LIGHT_WASH, storyLightPhase } from "../../lib/fork/story-light";

/**
 * Five fixed layers, one per phase; only the current one is visible. A phase change crossfades over
 * 20 seconds by opacity alone, which the browser composites without repainting, so it costs nothing
 * while the chat scrolls. With reduced motion it switches at once.
 */
export function ForkStoryLight() {
  const chatId = useChatStore((s) => s.activeChatId);
  const prefs = useChatWeatherPrefs(chatId);
  const time = useGameStateStore((s) => (s.current && s.current.chatId === chatId ? s.current.time : null));
  const phase = prefs.light ? storyLightPhase(time) : null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1]"
      data-fork-story-light={phase ?? "off"}
    >
      {STORY_LIGHT_PHASES.map((entry) => (
        <div
          key={entry}
          className="absolute inset-0 mix-blend-soft-light transition-opacity duration-[20000ms] ease-in-out motion-reduce:transition-none"
          style={{ backgroundImage: STORY_LIGHT_WASH[entry], opacity: phase === entry ? 0.7 : 0 }}
        />
      ))}
    </div>
  );
}
