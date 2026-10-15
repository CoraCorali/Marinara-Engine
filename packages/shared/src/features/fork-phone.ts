// Fork feature: Pocket Phone settings (see FORK.md).
//
// Kept in the chat's metadata as `forkPhone`. Off by default: Roleplay has no era, so the phone is
// switched on per chat for stories where people have phones.

export const FORK_PHONE_SKINS = ["slider", "candybar", "smartphone"] as const;
export type ForkPhoneSkin = (typeof FORK_PHONE_SKINS)[number];

/** The colours each skin comes in (the round 3 mockups). The first is the default. */
export const FORK_PHONE_COLORS: Record<ForkPhoneSkin, readonly string[]> = {
  slider: ["pink-pearl", "midnight", "mint", "lilac"],
  candybar: ["sky", "bubblegum", "silver"],
  smartphone: ["blush", "lilac", "graphite"],
};

export const FORK_PHONE_KEYS = ["qwerty", "number"] as const;
export type ForkPhoneKeys = (typeof FORK_PHONE_KEYS)[number];

export type ForkPhoneLook = {
  skin: ForkPhoneSkin;
  color: string;
  /** Candybar only: a QWERTY keyboard or number keys (silver with number keys is the classic). */
  keys: ForkPhoneKeys;
  /** Rhinestone flowers around the screen. */
  gems: boolean;
  /** Incoming calls flash in sparkly dot letters. */
  dotMatrix: boolean;
  /** A sticker sheet on the case. */
  stickers: boolean;
  /** Smartphone: a board picture as the lock screen wallpaper, or "". */
  wallpaper: string;
};

export type ForkPhoneSettings = ForkPhoneLook & {
  on: boolean;
  /** Each character's phone look, by character id (the AI picks one, you can change it). */
  characterLooks: Record<string, Partial<ForkPhoneLook>>;
};

export const DEFAULT_FORK_PHONE_LOOK: ForkPhoneLook = {
  skin: "slider",
  color: "pink-pearl",
  keys: "qwerty",
  gems: false,
  dotMatrix: true,
  stickers: false,
  wallpaper: "",
};

export function normalizeForkPhoneLook(raw: unknown, base: ForkPhoneLook = DEFAULT_FORK_PHONE_LOOK): ForkPhoneLook {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const skin = (FORK_PHONE_SKINS as readonly string[]).includes(input.skin as string)
    ? (input.skin as ForkPhoneSkin)
    : base.skin;
  const colors = FORK_PHONE_COLORS[skin];
  const color =
    typeof input.color === "string" && colors.includes(input.color)
      ? input.color
      : colors.includes(base.color)
        ? base.color
        : colors[0]!;
  const flag = (key: "gems" | "dotMatrix" | "stickers") =>
    typeof input[key] === "boolean" ? (input[key] as boolean) : base[key];
  return {
    skin,
    color,
    keys: input.keys === "number" || input.keys === "qwerty" ? input.keys : base.keys,
    gems: flag("gems"),
    dotMatrix: flag("dotMatrix"),
    stickers: flag("stickers"),
    wallpaper: typeof input.wallpaper === "string" ? input.wallpaper.slice(0, 300) : base.wallpaper,
  };
}

export function readForkPhoneSettings(metadata: Record<string, unknown> | null | undefined): ForkPhoneSettings {
  const raw = (metadata?.forkPhone ?? {}) as Record<string, unknown>;
  const looks: Record<string, Partial<ForkPhoneLook>> = {};
  if (raw.characterLooks && typeof raw.characterLooks === "object" && !Array.isArray(raw.characterLooks)) {
    for (const [id, look] of Object.entries(raw.characterLooks as Record<string, unknown>).slice(0, 24)) {
      looks[id] = normalizeForkPhoneLook(look);
    }
  }
  return { ...normalizeForkPhoneLook(raw), on: raw.on === true, characterLooks: looks };
}
