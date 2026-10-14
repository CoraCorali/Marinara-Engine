// ──────────────────────────────────────────────
// Fork: Option A character card (see FORK.md)
// ──────────────────────────────────────────────
// A roomy card that shows everything without cutting it off: a portrait ring, the mood as a pill,
// the thought as a bubble, labelled rows that wrap, and stats as bars with a word.
import type { ComponentProps } from "react";
import { Maximize2 } from "lucide-react";
import {
  characterCustomFieldTrackerLockKey,
  characterStatTrackerLockKey,
  characterTrackerLockKey,
  isTrackerFieldHidden,
  isTrackerFieldLocked,
} from "@marinara-engine/shared";
import { useTranslation as useUiTranslation } from "react-i18next";
import { statWordKey } from "../../../../lib/fork/stat-words";
import { trackerEditableText } from "../../lib/tracker-display";
import { getStatPercent } from "../../lib/tracker-stat-layout";
import { getCharacterAmbienceStyle } from "../../lib/tracker-profile-style";
import { InlineEdit, InlineNumber } from "../controls/InlineControls";
import { useTrackerLockContext } from "../TrackerLockContext";
import { CharacterTrackerCard } from "./CharacterTrackerCard";

type Props = ComponentProps<typeof CharacterTrackerCard>;

const ROW_LABEL_CLASS = "text-xs font-semibold text-[color:var(--tracker-profile-muted-text)]";
const ROW_VALUE_CLASS =
  "w-full min-w-0 px-0 py-0 text-[0.8125rem] leading-snug [--foreground:var(--tracker-profile-text)] [--muted-foreground:var(--tracker-profile-muted-text)]";

export function ForkCharacterCard(props: Props) {
  const { character, characterPicture, profileColors, characterIndex, onUpdate, onToggleFeatured } = props;
  const { t: localizeUi } = useUiTranslation();
  const { fieldLocks, hiddenTrackerFields, hideMode = false, lockMode = false } = useTrackerLockContext();

  // ponytail: the edit modes (add, delete, hide, lock) keep Marinara's own card, which carries every
  // control for them. Moving those controls onto this card is the upgrade if switching looks jarring.
  if (props.deleteMode || props.addMode || hideMode || lockMode) return <CharacterTrackerCard {...props} />;

  const key = (field: Parameters<typeof characterTrackerLockKey>[2]) =>
    characterTrackerLockKey(character, characterIndex, field);
  const shown = (field: "mood" | "appearance" | "outfit" | "thoughts") =>
    !isTrackerFieldHidden(hiddenTrackerFields, key(field));
  const locked = (lockKey: string) => isTrackerFieldLocked(fieldLocks, lockKey);
  const stats = Array.isArray(character.stats) ? character.stats : [];
  const customFields = Object.entries((character.customFields ?? {}) as Record<string, unknown>);
  const avatarMedia = characterPicture ?? character.avatarPath ?? null;

  const rows = [
    shown("outfit") && {
      label: localizeUi("ui.trackerPanel.forkCard.wearing"),
      value: character.outfit,
      lockKey: key("outfit"),
      save: (outfit: string) => onUpdate({ ...character, outfit: outfit || null }),
    },
    shown("appearance") && {
      label: localizeUi("ui.trackerPanel.forkCard.looks"),
      value: character.appearance,
      lockKey: key("appearance"),
      save: (appearance: string) => onUpdate({ ...character, appearance: appearance || null }),
    },
    ...customFields.map(([name, value]) => ({
      label: name,
      value: trackerEditableText(value),
      lockKey: characterCustomFieldTrackerLockKey(character, characterIndex, name, "value"),
      save: (next: string) =>
        onUpdate({ ...character, customFields: { ...(character.customFields ?? {}), [name]: next } }),
    })),
  ].filter((row): row is Exclude<typeof row, false> => Boolean(row));

  return (
    <article
      className="@container relative flex min-w-0 flex-col gap-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--tracker-profile-rule)_52%,transparent)] bg-[image:var(--tracker-profile-material)] p-3 text-[color:var(--tracker-profile-text)] shadow-[0_0_14px_color-mix(in_srgb,var(--tracker-profile-dialogue-glow)_14%,transparent)] [background-blend-mode:var(--tracker-profile-material-blend)]"
      style={getCharacterAmbienceStyle(character, profileColors)}
    >
      <button
        type="button"
        onClick={onToggleFeatured}
        title={localizeUi("ui.trackerPanel.charactertrackercard.featureCharacterCard")}
        aria-label={localizeUi("ui.trackerPanel.charactertrackercard.featureCharacterCard")}
        className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--tracker-profile-muted-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--tracker-profile-text)_8%,transparent)] hover:text-[color:var(--tracker-profile-text)]"
      >
        <Maximize2 size="0.75rem" />
      </button>

      <div className="flex min-w-0 items-center gap-3 pr-8">
        <button
          type="button"
          onClick={characterPicture ? undefined : props.onUploadAvatar}
          disabled={Boolean(characterPicture)}
          title={avatarMedia ? localizeUi("ui.panels.personaspanel.changeAvatar") : localizeUi("editor.avatar.upload")}
          aria-label={
            avatarMedia ? localizeUi("ui.panels.personaspanel.changeAvatar") : localizeUi("editor.avatar.upload")
          }
          className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--muted)] text-2xl leading-none ring-2 ring-[var(--tracker-profile-accent-solid)] ring-offset-2 ring-offset-[var(--card)] disabled:cursor-default"
        >
          {avatarMedia ? (
            <img src={avatarMedia} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span aria-hidden="true">{character.emoji || character.name?.trim().charAt(0) || "?"}</span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <InlineEdit
            value={character.name}
            onSave={(name) => onUpdate({ ...character, name: name || "Character" })}
            placeholder={localizeUi("ui.characters.cardlibrarydetailcard.character")}
            className="w-full min-w-0 px-0 py-0 text-base font-extrabold [--tracker-inline-foreground:var(--tracker-profile-text)]"
            showEditHint={false}
            previewLineCount="full"
            locked={locked(key("name"))}
          />
          {shown("mood") && (
            <InlineEdit
              value={character.mood}
              onSave={(mood) => onUpdate({ ...character, mood })}
              placeholder={localizeUi("ui.trackerPanel.charactertrackercard.mood")}
              className="max-w-full rounded-full bg-[color-mix(in_srgb,var(--tracker-profile-accent-solid)_20%,transparent)] px-2.5 py-1 text-xs font-semibold [--tracker-inline-foreground:var(--tracker-profile-text)]"
              showEditHint={false}
              previewLineCount="full"
              locked={locked(key("mood"))}
            />
          )}
        </div>
      </div>

      {shown("thoughts") && (
        <InlineEdit
          value={character.thoughts}
          onSave={(thoughts) => onUpdate({ ...character, thoughts: thoughts || null })}
          placeholder={localizeUi("ui.trackerPanel.thoughtbubble.thoughts")}
          className="ml-1.5 rounded-2xl bg-[image:var(--tracker-profile-field-material)] px-3 py-2 text-[0.8125rem] italic leading-snug [--tracker-inline-foreground:var(--tracker-profile-text)] [background-blend-mode:var(--tracker-profile-field-material-blend)]"
          showEditHint={false}
          previewLineCount="full"
          locked={locked(key("thoughts"))}
        />
      )}

      {rows.length > 0 && (
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1.5">
          {rows.map((row) => (
            <div key={row.lockKey} className="contents">
              <dt className={ROW_LABEL_CLASS}>{row.label}</dt>
              <dd className="m-0 min-w-0">
                <InlineEdit
                  value={row.value}
                  onSave={row.save}
                  placeholder="—"
                  className={ROW_VALUE_CLASS}
                  showEditHint={false}
                  previewLineCount="full"
                  locked={locked(row.lockKey)}
                />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {stats.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 @min-[240px]:grid-cols-2">
          {stats.map((stat, index) => {
            const percent = getStatPercent(stat);
            return (
              <div key={`${stat.name}-${index}`} className="flex min-w-0 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-bold">{stat.name}</span>
                  <span className="flex shrink-0 items-baseline gap-1 text-[color:var(--tracker-profile-muted-text)]">
                    <span className="italic">{localizeUi(statWordKey(percent))}</span>
                    <InlineNumber
                      value={stat.value}
                      onChange={(value) =>
                        onUpdate({
                          ...character,
                          stats: stats.map((entry, i) => (i === index ? { ...entry, value } : entry)),
                        })
                      }
                      title={localizeUi("ui.trackerPanel.charactertrackercard.value")}
                      className="min-w-0 px-0 py-0 text-xs tabular-nums"
                      locked={locked(characterStatTrackerLockKey(character, characterIndex, stat, "value", index))}
                    />
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--tracker-profile-text)_12%,transparent)]"
                  role="meter"
                  aria-label={stat.name}
                  aria-valuemin={0}
                  aria-valuemax={stat.max}
                  aria-valuenow={stat.value}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${percent}%`, background: stat.color || "var(--primary)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
