// ──────────────────────────────────────────────
// Fork: switches for a theme's animated effects (see FORK.md)
// ──────────────────────────────────────────────
//
// A theme lists its effects in comments, one per line:
//   /* @fork-effect petals | 🌸 Falling petals | roleplay | off */
// (id | label | where: roleplay or everywhere | default: on or off). Turning one off adds its id to
// <html data-fork-fx-off="...">, and the theme stops that effect with a rule such as
//   html[data-fork-fx-off~="petals"] .rpg-overlay::before { animation: none !important; display: none !important; }
// so a switched-off effect costs nothing, rather than animating on at zero opacity.

export interface ThemeEffect {
  id: string;
  label: string;
  where: "roleplay" | "everywhere";
  defaultOn: boolean;
}

const DECLARATION =
  /@fork-effect\s+([a-z0-9-]+)\s*\|\s*([^|*]+?)\s*\|\s*(roleplay|everywhere)\s*(?:\|\s*(on|off))?\s*\*\//gi;

/** The effects a theme's CSS declares, in the order it lists them. */
export function parseThemeEffects(css: string | null | undefined): ThemeEffect[] {
  if (!css) return [];
  const effects: ThemeEffect[] = [];
  for (const match of css.matchAll(DECLARATION)) {
    const id = match[1]!.toLowerCase();
    if (effects.some((effect) => effect.id === id)) continue;
    effects.push({
      id,
      label: match[2]!.trim(),
      where: match[3]!.toLowerCase() === "roleplay" ? "roleplay" : "everywhere",
      defaultOn: (match[4] ?? "on").toLowerCase() !== "off",
    });
  }
  return effects;
}

/** Whether an effect is on: the viewer's switch if they flipped it, else the theme's default. */
export function isThemeEffectOn(effect: ThemeEffect, choices: Record<string, boolean>): boolean {
  return choices[effect.id] ?? effect.defaultOn;
}

/** The value for <html data-fork-fx-off>: every declared effect that is off, space-separated. */
export function themeEffectsOffAttribute(effects: readonly ThemeEffect[], choices: Record<string, boolean>): string {
  return effects
    .filter((effect) => !isThemeEffectOn(effect, choices))
    .map((effect) => effect.id)
    .join(" ");
}
