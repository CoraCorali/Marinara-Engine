// ──────────────────────────────────────────────
// Fork: what a pin knows beyond its picture, one set of fields per category
// ──────────────────────────────────────────────
// Clothes have a slot and a wearer. Places, things, people and vibes get their own fields here: a
// place's building and room with a look per time of day, a thing's owner and holder, a person's role
// and card, a vibe's palette and mood words. Every field saves into the pin's `details`, which the
// server merges key by key, so clearing one ("nobody") never disturbs the others.
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import {
  FORK_PIN_WHO_PERSONA,
  FORK_PLACE_LOOKS,
  FORK_THING_AT_PLACE,
  FORK_THING_LOST,
  MAX_FORK_PIN_ALBUM,
  MAX_FORK_PIN_FEELINGS,
  MAX_FORK_VIBE_COLORS,
  MAX_FORK_VIBE_WORDS,
  type ForkPinDetails,
  type ForkPlaceLook,
} from "@marinara-engine/shared";
import { useAddAlbumPicture, useRemoveAlbumPicture, type BoardPin } from "../../hooks/use-fork-board";
import { useForkChapters } from "../../hooks/use-fork-chapters";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import { FORK_SWITCH_CLASS } from "../../lib/fork/switch";
import { cn } from "../../lib/utils";
import { HelpTooltip } from "../ui/HelpTooltip";
import type { PinCastMember, PinSave } from "./ForkPinEditor";

const CHIP =
  "flex min-h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors";
const CHIP_ON = "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]";
const CHIP_OFF = "border-[var(--border)] text-foreground/85 hover:bg-foreground/10";
const FIELD =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-[0.8125rem] leading-snug text-foreground outline-none placeholder:text-[var(--muted-foreground)]";

type Localize = (key: string, options?: Record<string, unknown>) => string;

function Label({ children }: { children: string }) {
  return <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">{children}</p>;
}

function Chip({
  on,
  onClick,
  children,
  pressed,
  className,
}: {
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(CHIP, on ? CHIP_ON : CHIP_OFF, className)}
    >
      {children}
    </button>
  );
}

/** An on/off row, spelled the same as the editor's in-scene switch. */
function SwitchRow({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  help?: string;
}) {
  return (
    <label className="flex min-h-9 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-[0.8125rem] font-semibold text-foreground">
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0">{label}</span>
        {help && <HelpTooltip buttonClassName="-m-2 p-2" text={help} side="top" wide size="0.75rem" />}
      </span>
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

/** A one-line field that saves a moment after typing stops. The label is optional for a field that already has one. */
function DraftLine({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, change, flush] = useForkDraftField(value, onCommit);
  const input = (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => change(event.target.value)}
      onBlur={flush}
      className={FIELD}
    />
  );
  if (!label) return input;
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {input}
    </div>
  );
}

interface Props {
  pin: BoardPin;
  cast: readonly PinCastMember[];
  personaName: string;
  chatId: string | null;
  /** Every pin in this scope, for the "at a place" and "inside" pickers. */
  allPins: readonly BoardPin[];
  save: (data: PinSave) => void;
}

export function ForkPinKindFields({ pin, cast, personaName, chatId, allPins, save }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const details: ForkPinDetails = pin.details ?? {};
  const saveDetails = (key: keyof ForkPinDetails, value: unknown) =>
    save({ details: { [key]: value } as PinSave["details"] });
  const nameFor = (who: string) =>
    who === FORK_PIN_WHO_PERSONA ? personaName : (cast.find((member) => member.id === who)?.name ?? who);
  const people = [
    ...(personaName ? [{ id: FORK_PIN_WHO_PERSONA, label: personaName }] : []),
    ...cast.map((member) => ({ id: member.id, label: member.name })),
  ];

  if (pin.category === "place") {
    return <PlaceFields pin={pin} details={details} save={save} saveDetails={saveDetails} localizeUi={localizeUi} />;
  }
  if (pin.category === "thing") {
    return (
      <ThingFields
        pin={pin}
        details={details}
        save={save}
        saveDetails={saveDetails}
        localizeUi={localizeUi}
        allPins={allPins}
        people={people}
        nameFor={nameFor}
      />
    );
  }
  if (pin.category === "person") {
    return <PersonFields details={details} saveDetails={saveDetails} localizeUi={localizeUi} people={people} />;
  }
  if (pin.category === "vibe") {
    return (
      <VibeFields details={details} save={save} saveDetails={saveDetails} localizeUi={localizeUi} chatId={chatId} />
    );
  }
  return null;
}

type SaveDetails = (key: keyof ForkPinDetails, value: unknown) => void;

// ── Place: the building and room, a look for each time of day, and whether the story brings it in ──

const LOOK_LABEL_KEYS: Record<ForkPlaceLook, string> = {
  day: "ui.chat.forkboard.lookDay",
  night: "ui.chat.forkboard.lookNight",
  rain: "ui.chat.forkboard.lookRain",
};

function PlaceFields({
  pin,
  details,
  save,
  saveDetails,
  localizeUi,
}: {
  pin: BoardPin;
  details: ForkPinDetails;
  save: (data: PinSave) => void;
  saveDetails: SaveDetails;
  localizeUi: Localize;
}) {
  const addPicture = useAddAlbumPicture({ scopeType: pin.scopeType, scopeId: pin.scopeId });
  const removePicture = useRemoveAlbumPicture({ scopeType: pin.scopeType, scopeId: pin.scopeId });
  // Which look the file picker is filling; read when the chosen file comes back.
  const lookRef = useRef<ForkPlaceLook>("day");
  const fileRef = useRef<HTMLInputElement>(null);
  const album = details.album ?? [];
  const pick = (look: ForkPlaceLook) => album.find((entry) => entry.look === look);
  const full = album.length >= MAX_FORK_PIN_ALBUM;

  const openFor = (look: ForkPlaceLook) => {
    if (full && !pick(look)) return;
    lookRef.current = look;
    fileRef.current?.click();
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    // The server replaces a look's old picture with the new one and deletes the old file.
    await addPicture.mutateAsync({ id: pin.id, file, look: lookRef.current });
  };

  return (
    <>
      <DraftLine
        label={localizeUi("ui.chat.forkboard.building")}
        value={pin.name}
        placeholder={localizeUi("ui.chat.forkboard.buildingPlaceholder")}
        onCommit={(next) => save({ name: next })}
      />
      <DraftLine
        label={localizeUi("ui.chat.forkboard.placeRoom")}
        value={details.room ?? ""}
        placeholder={localizeUi("ui.chat.forkboard.placeRoomPlaceholder")}
        onCommit={(next) => saveDetails("room", next)}
      />

      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.album")}</Label>
        <div className="flex flex-wrap gap-2.5">
          {FORK_PLACE_LOOKS.map((look) => {
            const picture = pick(look);
            return (
              <div key={look} className="flex flex-col items-center gap-1">
                {picture ? (
                  <button
                    type="button"
                    onClick={() => removePicture.mutate({ id: pin.id, path: picture.path })}
                    aria-label={localizeUi("ui.chat.forkboard.albumRemove")}
                    title={localizeUi("ui.chat.forkboard.albumRemove")}
                    className="relative block h-14 w-14 overflow-hidden rounded-lg ring-1 ring-[var(--border)]"
                  >
                    <img src={picture.path} alt="" className="h-full w-full object-cover" draggable={false} />
                    <span className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-black/60 text-white">
                      <X size="0.625rem" />
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFor(look)}
                    disabled={full}
                    aria-label={localizeUi("ui.chat.forkboard.albumAdd")}
                    title={localizeUi("ui.chat.forkboard.albumAdd")}
                    className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] disabled:opacity-40"
                  >
                    <Plus size="0.875rem" />
                  </button>
                )}
                <Chip
                  on={Boolean(picture)}
                  pressed={Boolean(picture)}
                  onClick={() => openFor(look)}
                  className="min-h-7 px-2 text-[0.6875rem]"
                >
                  {localizeUi(LOOK_LABEL_KEYS[look])}
                </Chip>
              </div>
            );
          })}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void upload(event)}
        />
      </div>

      <SwitchRow
        label={localizeUi("ui.chat.forkboard.followsStoryPlace")}
        checked={details.followStory !== false}
        help={localizeUi("ui.chat.forkboard.followsStoryHelp")}
        onChange={(next) => saveDetails("followStory", next)}
      />
    </>
  );
}

// ── Thing: one universal card, so a car, a ring and a key all work the same way ──

function ThingFields({
  pin,
  details,
  save,
  saveDetails,
  localizeUi,
  allPins,
  people,
  nameFor,
}: {
  pin: BoardPin;
  details: ForkPinDetails;
  save: (data: PinSave) => void;
  saveDetails: SaveDetails;
  localizeUi: Localize;
  allPins: readonly BoardPin[];
  people: { id: string; label: string }[];
  nameFor: (who: string) => string;
}) {
  const owner = details.owner ?? "";
  const holder = details.holder ?? "";
  const inside = details.inside ?? "";
  const feelings = details.feelings ?? [];
  const memories = details.memories ?? [];
  const places = allPins.filter((entry) => entry.category === "place" && entry.id !== pin.id);
  const containers = allPins.filter((entry) => entry.category === "thing" && entry.id !== pin.id);
  const [feelingWho, setFeelingWho] = useState(people[0]?.id ?? "");
  const [feelingText, setFeelingText] = useState("");
  const atPlace = holder.startsWith(FORK_THING_AT_PLACE) ? holder.slice(FORK_THING_AT_PLACE.length) : "";
  const placeTitle = (place: BoardPin) =>
    [place.name, place.details?.room].filter(Boolean).join(" › ") || place.caption.trim();

  const addFeeling = () => {
    const text = feelingText.trim();
    if (!text || !feelingWho || feelings.length >= MAX_FORK_PIN_FEELINGS) return;
    saveDetails("feelings", [...feelings, { who: feelingWho, text }]);
    setFeelingText("");
  };

  return (
    <>
      <DraftLine
        label={localizeUi("ui.chat.forkboard.thingName")}
        value={pin.name}
        onCommit={(next) => save({ name: next })}
      />

      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.belongsTo")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {people.map((person) => (
            <Chip
              key={person.id}
              on={owner === person.id}
              pressed={owner === person.id}
              onClick={() => saveDetails("owner", person.id)}
            >
              {person.label}
            </Chip>
          ))}
          <Chip on={!owner} pressed={!owner} onClick={() => saveDetails("owner", null)}>
            {localizeUi("ui.chat.forkboard.holderNobody")}
          </Chip>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.whoHasIt")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {people.map((person) => (
            <Chip
              key={person.id}
              on={holder === person.id}
              pressed={holder === person.id}
              onClick={() => saveDetails("holder", person.id)}
            >
              {person.label}
            </Chip>
          ))}
          <Chip
            on={holder === FORK_THING_LOST}
            pressed={holder === FORK_THING_LOST}
            onClick={() => saveDetails("holder", FORK_THING_LOST)}
          >
            {localizeUi("ui.chat.forkboard.holderLost")}
          </Chip>
          <Chip on={!holder} pressed={!holder} onClick={() => saveDetails("holder", null)}>
            {localizeUi("ui.chat.forkboard.holderNobody")}
          </Chip>
        </div>
        {places.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
            {localizeUi("ui.chat.forkboard.holderAtPlace")}
            <select
              value={atPlace}
              onChange={(event) =>
                saveDetails("holder", event.target.value ? `${FORK_THING_AT_PLACE}${event.target.value}` : null)
              }
              className="min-h-8 min-w-0 flex-1 rounded-xl bg-[var(--secondary)] px-2 text-xs font-semibold text-foreground outline-none"
            >
              <option value="">{localizeUi("ui.chat.forkboard.holderAtPlaceNone")}</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {placeTitle(place)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {containers.length > 0 && (
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground/80">
          <span className="flex items-center gap-1">
            {localizeUi("ui.chat.forkboard.inside")}
            <HelpTooltip
              buttonClassName="-m-2 p-2"
              text={localizeUi("ui.chat.forkboard.insideHelp")}
              side="top"
              wide
              size="0.75rem"
            />
          </span>
          <select
            value={inside}
            onChange={(event) => saveDetails("inside", event.target.value || null)}
            className="min-h-8 w-full rounded-xl bg-[var(--secondary)] px-2 text-xs font-semibold text-foreground outline-none"
          >
            <option value="">{localizeUi("ui.chat.forkboard.insideNone")}</option>
            {containers.map((thing) => (
              <option key={thing.id} value={thing.id}>
                {thing.name || thing.caption}
              </option>
            ))}
          </select>
        </label>
      )}

      <DraftLine
        label={localizeUi("ui.chat.forkboard.thingStatus")}
        value={details.status ?? ""}
        placeholder={localizeUi("ui.chat.forkboard.thingStatusPlaceholder")}
        onCommit={(next) => saveDetails("status", next)}
      />

      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.feelingHowTheyFeel")}</Label>
        {feelings.map((feeling, index) => (
          <div
            key={`${feeling.who}-${index}`}
            className="flex items-center gap-2 rounded-xl bg-[var(--secondary)] px-3 py-1.5"
          >
            <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-foreground">
              <span className="font-bold">{nameFor(feeling.who) || feeling.who}</span> {feeling.text}
            </p>
            <button
              type="button"
              onClick={() =>
                saveDetails(
                  "feelings",
                  feelings.filter((_, at) => at !== index),
                )
              }
              aria-label={localizeUi("ui.chat.forkboard.feelingRemove")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)]"
            >
              <X size="0.75rem" />
            </button>
          </div>
        ))}
        {feelings.length < MAX_FORK_PIN_FEELINGS && people.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={feelingWho}
              onChange={(event) => setFeelingWho(event.target.value)}
              aria-label={localizeUi("ui.chat.forkboard.feelingWho")}
              className="min-h-8 rounded-xl bg-[var(--secondary)] px-2 text-xs font-semibold text-foreground outline-none"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={feelingText}
              onChange={(event) => setFeelingText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addFeeling();
              }}
              className={cn(FIELD, "min-w-0 flex-1")}
            />
            <button
              type="button"
              onClick={addFeeling}
              disabled={!feelingText.trim()}
              className="flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] px-2.5 text-xs font-semibold text-[var(--primary)] disabled:opacity-50"
            >
              <Plus size="0.6875rem" />
              {localizeUi("ui.chat.forkboard.feelingAdd")}
            </button>
          </div>
        )}
      </div>

      {/* Memories are the story's own record of it, written when a chapter ends. */}
      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.thingMemories")}</Label>
        {memories.length === 0 ? (
          <p className="m-0 text-xs text-[var(--muted-foreground)]">
            {localizeUi("ui.chat.forkboard.thingNoMemories")}
          </p>
        ) : (
          memories.map((memory, index) => (
            <p key={index} className="m-0 text-[0.8125rem] leading-snug text-foreground/85">
              {memory.chapter > 0 && (
                <span className="font-bold">
                  {localizeUi("ui.chat.forkboard.memoryChapter", { number: memory.chapter })} ·{" "}
                </span>
              )}
              {memory.text}
            </p>
          ))
        )}
      </div>

      <SwitchRow
        label={localizeUi("ui.chat.forkboard.thingImportant")}
        checked={details.important === true}
        onChange={(next) => saveDetails("important", next ? true : null)}
      />
      <SwitchRow
        label={localizeUi("ui.chat.forkboard.followsStoryThing")}
        checked={details.followStory === true}
        help={localizeUi("ui.chat.forkboard.followsStoryHelp")}
        onChange={(next) => saveDetails("followStory", next)}
      />
    </>
  );
}

// ── Person: a face for someone without a card, linked to one when there is one ──

function PersonFields({
  details,
  saveDetails,
  localizeUi,
  people,
}: {
  details: ForkPinDetails;
  saveDetails: SaveDetails;
  localizeUi: Localize;
  people: { id: string; label: string }[];
}) {
  const linked = details.characterId ?? "";
  return (
    <>
      <DraftLine
        label={localizeUi("ui.chat.forkboard.personRole")}
        value={details.role ?? ""}
        placeholder={localizeUi("ui.chat.forkboard.personRolePlaceholder")}
        onCommit={(next) => saveDetails("role", next)}
      />
      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.linkACard")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {people.map((person) => (
            <Chip
              key={person.id}
              on={linked === person.id}
              pressed={linked === person.id}
              onClick={() => saveDetails("characterId", person.id)}
            >
              {person.label}
            </Chip>
          ))}
          <Chip on={!linked} pressed={!linked} onClick={() => saveDetails("characterId", null)}>
            {localizeUi("ui.chat.forkboard.linkNone")}
          </Chip>
        </div>
      </div>
      <SwitchRow
        label={localizeUi("ui.chat.forkboard.followsStoryPerson")}
        checked={details.followStory !== false}
        help={localizeUi("ui.chat.forkboard.followsStoryHelp")}
        onChange={(next) => saveDetails("followStory", next)}
      />
    </>
  );
}

// ── Vibe: a palette and a few mood words, sent as tone only ──

function VibeFields({
  details,
  save,
  saveDetails,
  localizeUi,
  chatId,
}: {
  details: ForkPinDetails;
  save: (data: PinSave) => void;
  saveDetails: SaveDetails;
  localizeUi: Localize;
  chatId: string | null;
}) {
  const { data: chapters } = useForkChapters(chatId);
  const chapter = chapters?.current.number ?? 1;
  const palette = details.palette ?? [];
  const words = details.words ?? [];
  const span = details.span === "chapter" ? "chapter" : "story";
  const [word, setWord] = useState("");

  const addWord = () => {
    const next = word.trim();
    if (!next || words.length >= MAX_FORK_VIBE_WORDS || words.includes(next)) return;
    saveDetails("words", [...words, next]);
    setWord("");
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.vibePalette")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          {palette.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() =>
                saveDetails(
                  "palette",
                  palette.filter((entry) => entry !== color),
                )
              }
              aria-label={localizeUi("ui.chat.forkboard.vibeRemoveColour")}
              title={color}
              className="h-7 w-7 rounded-lg ring-1 ring-[var(--border)]"
              style={{ background: color }}
            />
          ))}
          {palette.length < MAX_FORK_VIBE_COLORS && (
            <input
              type="color"
              aria-label={localizeUi("ui.chat.forkboard.vibeAddColour")}
              onChange={(event) => {
                const color = event.target.value.toLowerCase();
                if (!palette.includes(color)) saveDetails("palette", [...palette, color]);
              }}
              className="h-7 w-7 cursor-pointer rounded-lg border border-dashed border-[var(--border)] bg-transparent"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.vibeWords")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {words.map((entry) => (
            <Chip
              key={entry}
              on
              onClick={() =>
                saveDetails(
                  "words",
                  words.filter((value) => value !== entry),
                )
              }
              className="gap-1"
            >
              {entry}
              <X size="0.625rem" />
            </Chip>
          ))}
          {words.length < MAX_FORK_VIBE_WORDS && (
            <span className="flex items-center gap-1.5">
              <input
                type="text"
                value={word}
                onChange={(event) => setWord(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addWord();
                }}
                className="min-h-8 w-28 rounded-full border border-dashed border-[var(--border)] bg-[var(--secondary)] px-3 text-xs text-foreground outline-none"
              />
              <button
                type="button"
                onClick={addWord}
                disabled={!word.trim()}
                className="flex min-h-8 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] px-2.5 text-xs font-semibold text-[var(--primary)] disabled:opacity-50"
              >
                <Plus size="0.6875rem" />
                {localizeUi("ui.chat.forkboard.vibeAddWord")}
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{localizeUi("ui.chat.forkboard.vibeSpan")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {(["chapter", "story"] as const).map((option) => (
            <Chip
              key={option}
              on={span === option}
              pressed={span === option}
              // A chapter vibe remembers which chapter it was set in; a story vibe keeps none.
              onClick={() =>
                save({
                  details: {
                    span: option,
                    ...(option === "chapter" ? { chapter } : { chapter: null }),
                  } as PinSave["details"],
                })
              }
            >
              {localizeUi(
                option === "chapter" ? "ui.chat.forkboard.vibeThisChapterNumber" : "ui.chat.forkboard.vibeWholeStory",
                { number: chapter },
              )}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );
}
