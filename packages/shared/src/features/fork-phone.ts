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
  /** A soft ping (and a buzz where the device can) when a text or call comes in. */
  ping: boolean;
  /** Smartphone: a board picture as the lock screen wallpaper, or "". */
  wallpaper: string;
};

/** What a contact is to you, like the label on a real phone's contact card. "custom" uses your own word. */
export const FORK_PHONE_RELATIONS = [
  "family",
  "bestFriend",
  "closeFriend",
  "friend",
  "staff",
  "other",
  "custom",
] as const;
export type ForkPhoneRelation = (typeof FORK_PHONE_RELATIONS)[number];

/** How the models are told each label. */
export const FORK_PHONE_RELATION_WORDS: Record<ForkPhoneRelation, string> = {
  family: "family",
  bestFriend: "best friend",
  closeFriend: "close friend",
  friend: "friend",
  staff: "staff",
  other: "contact",
  custom: "contact",
};

/** In a contact's "close with" list, the persona; everyone else is a character id. */
export const FORK_PHONE_CONTACT_PERSONA = "persona";

/**
 * Someone in your phone who is not a card character: Mom, a coworker, an ex. They have no phone of
 * their own; you text them and the AI answers as them.
 */
export type ForkPhoneContact = {
  /** The name the AI uses, and their texts are found by. */
  name: string;
  relation: ForkPhoneRelation;
  /** Your own word for them when `relation` is "custom" ("gardener", "boss"). */
  label: string;
  /** How your phone shows them ("Theo (Gardener)"), or "" for their name. */
  shownAs: string;
  /** Who they are, in your words, for the AI ("my mom, worries a lot, texts in all caps"). */
  note: string;
  personality: string;
  /** When and how they text ("after work, or when he arrives on the property"). */
  texting: string;
  /** Who they are close to: "persona" and/or character ids. They text only these. */
  closeWith: string[];
};

export const MAX_FORK_PHONE_CONTACTS = 30;
export const MAX_FORK_PHONE_CONTACT_NOTE = 300;
const MAX_CONTACT_FIELD = 200;
const MAX_CONTACT_LABEL = 40;

/** The word for what they are to you: your own label, or the chosen one. */
export function forkPhoneRelationWord(contact: Pick<ForkPhoneContact, "relation" | "label">): string {
  return contact.relation === "custom" && contact.label ? contact.label : FORK_PHONE_RELATION_WORDS[contact.relation];
}

export type ForkPhoneSettings = ForkPhoneLook & {
  on: boolean;
  /** Each character's phone look, by character id (the AI picks one, you can change it). */
  characterLooks: Record<string, Partial<ForkPhoneLook>>;
  /** Your contacts, oldest first. */
  contacts: ForkPhoneContact[];
};

/** A contact's name as stored: single spaces, at most 60 characters. */
export function forkPhoneContactName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

/** One contact's fields, cleaned; null without a name. Older contacts lack the newer fields. */
export function normalizeForkPhoneContact(raw: unknown): ForkPhoneContact | null {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = forkPhoneContactName(input.name);
  if (!name) return null;
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const closeWith = Array.isArray(input.closeWith)
    ? [...new Set(input.closeWith.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))].slice(
        0,
        20,
      )
    : [FORK_PHONE_CONTACT_PERSONA];
  return {
    name,
    relation: (FORK_PHONE_RELATIONS as readonly string[]).includes(input.relation as string)
      ? (input.relation as ForkPhoneRelation)
      : "other",
    label: text(input.label, MAX_CONTACT_LABEL),
    shownAs: forkPhoneContactName(input.shownAs),
    note: text(input.note, MAX_FORK_PHONE_CONTACT_NOTE),
    personality: text(input.personality, MAX_CONTACT_FIELD),
    texting: text(input.texting, MAX_CONTACT_FIELD),
    closeWith,
  };
}

export function normalizeForkPhoneContacts(raw: unknown): ForkPhoneContact[] {
  const contacts: ForkPhoneContact[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const contact = normalizeForkPhoneContact(entry);
    // Names are unique whatever their case, since a contact's thread is found by name.
    if (!contact || contacts.some((other) => other.name.toLowerCase() === contact.name.toLowerCase())) continue;
    contacts.push(contact);
  }
  return contacts.slice(0, MAX_FORK_PHONE_CONTACTS);
}

export const DEFAULT_FORK_PHONE_LOOK: ForkPhoneLook = {
  skin: "slider",
  color: "pink-pearl",
  keys: "qwerty",
  gems: false,
  dotMatrix: true,
  stickers: false,
  ping: true,
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
  const flag = (key: "gems" | "dotMatrix" | "stickers" | "ping") =>
    typeof input[key] === "boolean" ? (input[key] as boolean) : base[key];
  return {
    skin,
    color,
    keys: input.keys === "number" || input.keys === "qwerty" ? input.keys : base.keys,
    gems: flag("gems"),
    dotMatrix: flag("dotMatrix"),
    stickers: flag("stickers"),
    ping: flag("ping"),
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
  return {
    ...normalizeForkPhoneLook(raw),
    on: raw.on === true,
    characterLooks: looks,
    contacts: normalizeForkPhoneContacts(raw.contacts),
  };
}
