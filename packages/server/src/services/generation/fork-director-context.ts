// Fork feature: the Director's chair (see FORK.md).
//
// What the Director gets to see, and how it reads. The route fetches the pieces; the shape lives
// here so a regression can pin it instead of it sitting inline in a route.

/** How far back the Director reads. Enough to judge the last reply, never the whole story. */
export const DIRECTOR_SCENE_MESSAGES = 10;
const MAX_CARD_FIELD_CHARS = 4000;
/** Older scene messages are background, so a shorter cut is fine for them. */
const MAX_SCENE_MESSAGE_CHARS = 1200;
/**
 * The reply being discussed, and the writer's turn it answered, are read whole. "The ending felt
 * out of character" means nothing to a Director that only saw the opening paragraph.
 */
const MAX_LATEST_MESSAGE_CHARS = 12000;
const LATEST_MESSAGES = 2;
const MAX_STANDING_CHARS = 3000;
const MAX_LORE_ENTRIES = 12;
const MAX_LORE_CHARS = 600;
// Fork: room for the chapter recaps, which come before the rolling summary.
const MAX_SUMMARY_CHARS = 12000;

/** Plain text only: a card, a lore entry or a reply can carry markup the Director has no use for. */
export function clampPlainText(value: unknown, limit: number): string {
  return typeof value === "string"
    ? value
        .replace(/<[^>]{0,2000}>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit)
    : "";
}

export interface DirectorCard {
  name?: unknown;
  description?: unknown;
  personality?: unknown;
}

export interface DirectorLoreEntry {
  name?: unknown;
  content?: unknown;
}

export interface DirectorSceneMessage {
  role?: unknown;
  content?: unknown;
}

export interface DirectorContextSources {
  /** The characters in the scene. */
  cards: DirectorCard[];
  /** Who the writer plays, persona or character card. */
  persona?: DirectorCard | null;
  /** Lorebook entries the recent scene activated, already budgeted. */
  lore?: DirectorLoreEntry[];
  /** The chat's running summary of everything older than the recent scene. */
  summary?: string | null;
  /** The tail of the story, oldest first. */
  scene: DirectorSceneMessage[];
  /** Where the relationships stand and what is pinned in the scene, as the writer model gets it. */
  standing?: string | null;
}

function cardText(card: DirectorCard): string {
  const description = clampPlainText(card.description, MAX_CARD_FIELD_CHARS);
  const personality = clampPlainText(card.personality, MAX_CARD_FIELD_CHARS);
  const name = clampPlainText(card.name, 120);
  if (!name && !description && !personality) return "";
  return [
    `Name: ${name || "Unknown"}`,
    description && `Description: ${description}`,
    personality && `Personality: ${personality}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The context block that rides along with the off-record conversation: who is in the scene, who
 * the writer plays, the lore the story is running on, what has happened so far, and the last few
 * messages. A part with nothing in it is left out rather than sent as an empty tag.
 */
export function buildDirectorContext(sources: DirectorContextSources): string {
  const cards = sources.cards.map(cardText).filter(Boolean).join("\n\n");
  const persona = sources.persona ? cardText(sources.persona) : "";
  const lore = (sources.lore ?? [])
    .slice(0, MAX_LORE_ENTRIES)
    .map((entry) => {
      const content = clampPlainText(entry.content, MAX_LORE_CHARS);
      if (!content) return "";
      const name = clampPlainText(entry.name, 120);
      return name ? `${name}: ${content}` : content;
    })
    .filter(Boolean)
    .join("\n");
  // The newest part of the story matters most here, so a long one keeps its end.
  const fullSummary = clampPlainText(sources.summary, Number.MAX_SAFE_INTEGER);
  const summary = fullSummary.length > MAX_SUMMARY_CHARS ? `…${fullSummary.slice(-MAX_SUMMARY_CHARS)}` : fullSummary;
  // Kept as lines rather than flattened: it is a list.
  const standing = typeof sources.standing === "string" ? sources.standing.trim().slice(0, MAX_STANDING_CHARS) : "";
  const latestFrom = sources.scene.length - LATEST_MESSAGES;
  const scene = sources.scene
    .map((message, index) => {
      const limit = index >= latestFrom ? MAX_LATEST_MESSAGE_CHARS : MAX_SCENE_MESSAGE_CHARS;
      const content = clampPlainText(message.content, limit);
      // Narration and other characters all read as the story; only the Player's own turns are theirs.
      return content ? `${message.role === "user" ? "Player" : "Story"}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return [
    cards && `<characters>\n${cards}\n</characters>`,
    persona && `<the_players_character>\n${persona}\n</the_players_character>`,
    lore && `<lore_in_play>\n${lore}\n</lore_in_play>`,
    summary && `<story_so_far>\n${summary}\n</story_so_far>`,
    standing && `<where_things_stand>\n${standing}\n</where_things_stand>`,
    scene && `<recent_scene>\n${scene}\n</recent_scene>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
