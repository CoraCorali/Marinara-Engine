// Fork feature: the story as the board's following pins see it (see FORK.md).
import {
  FORK_PIN_WHO_PERSONA,
  forkStoryIsNight,
  forkStoryIsRaining,
  normalizeTextForMatch,
} from "@marinara-engine/shared";
import type { BoardStoryNow } from "./fork-board-pins.js";

type SceneLike = { location?: unknown; time?: unknown; weather?: unknown; presentCharacters?: unknown };

/** Where the scene is, who is present, the hour and the weather, from a world-state row. */
export function storyNowFromScene(
  scene: SceneLike | null | undefined,
  cast: readonly { id: string; name: string }[],
  chapter?: number,
): BoardStoryNow {
  let present: unknown = scene?.presentCharacters;
  if (typeof present === "string") {
    try {
      present = JSON.parse(present);
    } catch {
      present = [];
    }
  }
  const presentNames = (Array.isArray(present) ? present : [])
    .map((character) => String((character as { name?: unknown })?.name ?? "").trim())
    .filter(Boolean);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    location: text(scene?.location),
    night: forkStoryIsNight(text(scene?.time)),
    raining: forkStoryIsRaining(text(scene?.weather)),
    presentIds: [
      FORK_PIN_WHO_PERSONA,
      ...cast
        .filter((member) =>
          presentNames.some((name) => normalizeTextForMatch(name) === normalizeTextForMatch(member.name)),
        )
        .map((member) => member.id),
    ],
    presentNames,
    ...(chapter ? { chapter } : {}),
  };
}
