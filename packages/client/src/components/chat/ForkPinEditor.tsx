// ──────────────────────────────────────────────
// Fork: editing one board pin — who it is for, what it is, and what it shows
// ──────────────────────────────────────────────
import { useId } from "react";
import { Loader2, Shirt, Sparkles, Trash2 } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { FORK_PIN_WHO_PERSONA, FORK_PIN_WHO_SCENE, FORK_WEAR_SLOTS, type ForkWearSlot } from "@marinara-engine/shared";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import {
  BOARD_PIN_CATEGORIES,
  useCreateOutfit,
  useDescribeBoardPin,
  useUpdateBoardPin,
  type BoardPin,
  type BoardPinCategory,
  type BoardScope,
} from "../../hooks/use-fork-board";
import { FORK_SWITCH_CLASS } from "../../lib/fork/switch";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui.store";

export const PIN_CATEGORY_LABEL_KEYS: Record<BoardPinCategory, string> = {
  wearing: "ui.chat.forkboard.categoryWearing",
  place: "ui.chat.forkboard.categoryPlace",
  person: "ui.chat.forkboard.categoryPerson",
  thing: "ui.chat.forkboard.categoryThing",
  vibe: "ui.chat.forkboard.categoryVibe",
};

export const PIN_SLOT_LABEL_KEYS: Record<ForkWearSlot, string> = {
  outfit: "ui.chat.forkboard.slot.outfit",
  top: "ui.chat.forkboard.slot.top",
  bottom: "ui.chat.forkboard.slot.bottom",
  dress: "ui.chat.forkboard.slot.dress",
  outerwear: "ui.chat.forkboard.slot.outerwear",
  shoes: "ui.chat.forkboard.slot.shoes",
  bag: "ui.chat.forkboard.slot.bag",
  jewelry: "ui.chat.forkboard.slot.jewelry",
  hair: "ui.chat.forkboard.slot.hair",
  makeup: "ui.chat.forkboard.slot.makeup",
  nails: "ui.chat.forkboard.slot.nails",
};

export type PinCastMember = { id: string; name: string };

const CHIP =
  "flex min-h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors";
const CHIP_ON = "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]";
const CHIP_OFF = "border-[var(--border)] text-foreground/85 hover:bg-foreground/10";

function Label({ children }: { children: string }) {
  return <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">{children}</p>;
}

/** "Kyli · Dress", "Place", "Vee · Outfit": the short tag a polaroid wears. */
export function pinTag(
  pin: BoardPin,
  personaName: string,
  cast: readonly PinCastMember[],
  localize: (key: string) => string,
): string {
  const who =
    pin.who === FORK_PIN_WHO_PERSONA
      ? personaName
      : pin.who && pin.who !== FORK_PIN_WHO_SCENE
        ? (cast.find((member) => member.id === pin.who)?.name ?? "")
        : "";
  const what =
    pin.category === "wearing" && pin.slot
      ? localize(PIN_SLOT_LABEL_KEYS[pin.slot])
      : localize(PIN_CATEGORY_LABEL_KEYS[pin.category]);
  return who ? `${who} · ${what}` : what;
}

export function ForkPinEditor({
  pin,
  scope,
  chatId,
  personaName,
  cast,
  onDelete,
  closet = false,
}: {
  pin: BoardPin;
  scope: BoardScope;
  chatId: string | null;
  personaName: string;
  cast: readonly PinCastMember[];
  onDelete: () => void;
  /** A piece of a closet outfit: who wears it and whether it is in scene are chosen when it is worn. */
  closet?: boolean;
}) {
  const { t: localizeUi } = useUiTranslation();
  const debugMode = useUIStore((s) => s.debugMode);
  const updatePin = useUpdateBoardPin(scope);
  const describePin = useDescribeBoardPin();
  const createOutfit = useCreateOutfit();
  const captionId = useId();
  const save = (data: Omit<Parameters<typeof updatePin.mutate>[0], "id">) => updatePin.mutate({ id: pin.id, ...data });
  const [caption, changeCaption, flushCaption] = useForkDraftField(pin.caption, (value: string) =>
    save({ caption: value }),
  );

  const wearing = closet || pin.category === "wearing";
  // A wearing pin is always about someone; a place or a vibe is about the scene.
  const whoOptions: { id: string; label: string }[] = [
    ...(personaName
      ? [{ id: FORK_PIN_WHO_PERSONA, label: localizeUi("ui.chat.forkboard.whoYou", { name: personaName }) }]
      : []),
    ...cast.map((member) => ({ id: member.id, label: member.name })),
    { id: FORK_PIN_WHO_SCENE, label: localizeUi("ui.chat.forkboard.whoScene") },
  ];

  const describe = () => {
    if (describePin.isPending) return;
    describePin.mutate(
      { id: pin.id, chatId, debugMode },
      {
        onSuccess: (suggestion) => {
          // The suggestion is applied, and can be changed like anything typed by hand.
          changeCaption(suggestion.caption);
          save({
            caption: suggestion.caption,
            category: suggestion.category,
            ...(suggestion.category === "wearing" ? { slot: suggestion.slot, shows: suggestion.shows } : {}),
          });
          toast.success(localizeUi("ui.chat.forkboard.described"));
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkboard.couldNotDescribe")),
      },
    );
  };

  return (
    <div className="fork-ui flex flex-col gap-3">
      <img
        src={pin.imagePath}
        alt={pin.caption || localizeUi("ui.chat.forkboard.referencePicture")}
        className="mx-auto max-h-[34vh] rounded-lg object-contain shadow-[0_6px_16px_rgba(0,0,0,0.35)]"
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={captionId} className="text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">
          {localizeUi("ui.chat.forkboard.caption")}
        </label>
        <textarea
          id={captionId}
          rows={2}
          value={caption}
          placeholder={localizeUi("ui.chat.forkboard.captionPlaceholder")}
          onChange={(event) => changeCaption(event.target.value)}
          onBlur={flushCaption}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-[0.8125rem] leading-snug text-foreground outline-none [field-sizing:content] placeholder:text-[var(--muted-foreground)]"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={describe}
            disabled={describePin.isPending}
            className="flex min-h-8 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] px-3 text-xs font-semibold text-[var(--primary)] disabled:opacity-60"
          >
            {describePin.isPending ? <Loader2 size="0.75rem" className="animate-spin" /> : <Sparkles size="0.75rem" />}
            {localizeUi("ui.chat.forkboard.describeIt")}
          </button>
          <p className="min-w-0 flex-1 text-[0.6875rem] leading-snug text-[var(--muted-foreground)]">
            {localizeUi("ui.chat.forkboard.captionHint")}
          </p>
        </div>
      </div>

      {!closet && (
        <div className="flex flex-col gap-1.5">
          <Label>{localizeUi("ui.chat.forkboard.whatIsIt")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {BOARD_PIN_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => save({ category })}
                aria-pressed={pin.category === category}
                className={cn(CHIP, pin.category === category ? CHIP_ON : CHIP_OFF)}
              >
                {localizeUi(PIN_CATEGORY_LABEL_KEYS[category])}
              </button>
            ))}
          </div>
        </div>
      )}

      {!closet && (
        <div className="flex flex-col gap-1.5">
          <Label>{localizeUi(wearing ? "ui.chat.forkboard.whoWears" : "ui.chat.forkboard.whoIsItAbout")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {whoOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => save({ who: option.id })}
                aria-pressed={pin.who === option.id}
                className={cn(CHIP, pin.who === option.id ? CHIP_ON : CHIP_OFF)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {wearing && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>{localizeUi("ui.chat.forkboard.slotLabel")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {FORK_WEAR_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => save({ slot })}
                  aria-pressed={pin.slot === slot}
                  className={cn(CHIP, pin.slot === slot ? CHIP_ON : CHIP_OFF)}
                >
                  {localizeUi(PIN_SLOT_LABEL_KEYS[slot])}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{localizeUi("ui.chat.forkboard.pictureShows")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["model", "clothes"] as const).map((shows) => (
                <button
                  key={shows}
                  type="button"
                  onClick={() => save({ shows })}
                  aria-pressed={pin.shows === shows}
                  className={cn(CHIP, pin.shows === shows ? CHIP_ON : CHIP_OFF)}
                >
                  {localizeUi(shows === "model" ? "ui.chat.forkboard.showsModel" : "ui.chat.forkboard.showsClothes")}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!closet && (
        <label className="flex min-h-9 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-[0.8125rem] font-semibold text-foreground">
          {localizeUi("ui.chat.forkboard.inSceneSwitch")}
          <input
            type="checkbox"
            role="switch"
            checked={pin.inScene}
            onChange={(event) => save({ inScene: event.target.checked })}
            className={FORK_SWITCH_CLASS}
          />
        </label>
      )}

      {/* One piece into the closet, so it can be worn in any chat. */}
      {!closet && wearing && (
        <button
          type="button"
          disabled={createOutfit.isPending}
          onClick={() =>
            createOutfit.mutate(
              {
                name: pin.caption.split(",")[0]?.trim() || localizeUi("ui.chat.forkcloset.untitled"),
                pinIds: [pin.id],
              },
              { onSuccess: () => toast.success(localizeUi("ui.chat.forkcloset.savedToCloset")) },
            )
          }
          className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-xs font-semibold text-[var(--primary)] disabled:opacity-60"
        >
          {createOutfit.isPending ? <Loader2 size="0.75rem" className="animate-spin" /> : <Shirt size="0.75rem" />}
          {localizeUi("ui.chat.forkcloset.saveToCloset")}
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--destructive)]"
      >
        <Trash2 size="0.75rem" />
        {localizeUi("ui.chat.forkboard.removePin")}
      </button>
    </div>
  );
}
