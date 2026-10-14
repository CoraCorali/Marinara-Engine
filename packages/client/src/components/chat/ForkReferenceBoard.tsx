// ──────────────────────────────────────────────
// Fork: Reference Board — pinned pictures sent with every reply
// ──────────────────────────────────────────────
import { useRef, useState, type ChangeEvent } from "react";
import { Plus, Trash2, Loader2, Pin, PinOff } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { showConfirmDialog } from "../../lib/app-dialogs";
import {
  BOARD_PIN_CATEGORIES,
  useAddBoardPin,
  useBoardPins,
  useDeleteBoardPin,
  useUpdateBoardPin,
  type BoardPinCategory,
  type BoardScope,
} from "../../hooks/use-fork-board";

const CATEGORY_LABEL_KEYS: Record<BoardPinCategory, string> = {
  wearing: "ui.chat.forkboard.categoryWearing",
  place: "ui.chat.forkboard.categoryPlace",
  person: "ui.chat.forkboard.categoryPerson",
  thing: "ui.chat.forkboard.categoryThing",
  vibe: "ui.chat.forkboard.categoryVibe",
};

interface Props {
  chatScope: BoardScope;
  personaScope: BoardScope;
}

/**
 * Two boards in one panel: this chat's pins, and the persona's own pins that follow them into
 * every chat. A pin that is "in scene" is sent to the model with every reply.
 */
export function ForkReferenceBoard({ chatScope, personaScope }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const [tab, setTab] = useState<"chat" | "persona">("chat");
  const scope = tab === "chat" ? chatScope : personaScope;
  const { data: pins, isLoading } = useBoardPins(scope);
  const addPin = useAddBoardPin(scope);
  const updatePin = useUpdateBoardPin(scope);
  const deletePin = useDeleteBoardPin(scope);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!scope) return;
    for (const file of files) {
      try {
        await addPin.mutateAsync({ file });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkboard.couldNotPinThatPicture"));
        break;
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await showConfirmDialog({
        title: localizeUi("ui.chat.forkboard.removePin"),
        message: localizeUi("ui.chat.forkboard.removePinBody"),
        confirmLabel: localizeUi("ui.chat.forkboard.remove"),
        chatStyle: true,
      }))
    ) {
      return;
    }
    try {
      await deletePin.mutateAsync(id);
    } catch {
      toast.error(localizeUi("ui.chat.forkboard.couldNotRemoveThatPin"));
    }
  };

  const inSceneCount = (pins ?? []).filter((pin) => pin.inScene).length;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-[var(--secondary)] p-1">
          <button
            type="button"
            onClick={() => setTab("chat")}
            className={`min-h-11 rounded-md px-3 text-sm font-semibold ${tab === "chat" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-foreground/70"}`}
          >
            {localizeUi("ui.chat.forkboard.thisChat")}
          </button>
          <button
            type="button"
            onClick={() => setTab("persona")}
            disabled={!personaScope}
            className={`min-h-11 rounded-md px-3 text-sm font-semibold disabled:opacity-40 ${tab === "persona" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-foreground/70"}`}
          >
            {localizeUi("ui.chat.forkboard.alwaysOn")}
          </button>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!scope || addPin.isPending}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {addPin.isPending ? <Loader2 size="0.875rem" className="animate-spin" /> : <Plus size="0.875rem" />}
          {localizeUi("ui.chat.forkboard.pinAPicture")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        {tab === "chat" ? localizeUi("ui.chat.forkboard.thisChatHelp") : localizeUi("ui.chat.forkboard.alwaysOnHelp")}
      </p>

      {!scope ? (
        <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
          {localizeUi("ui.chat.forkboard.pickAPersonaFirst")}
        </p>
      ) : isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 size="1.25rem" className="animate-spin text-[var(--muted-foreground)]" />
        </div>
      ) : (pins ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
          {localizeUi("ui.chat.forkboard.noPinsYet")}
        </p>
      ) : (
        <>
          <p className="text-xs font-semibold text-[var(--muted-foreground)]">
            {localizeUi("ui.chat.forkboard.value1InScene", { value1: inSceneCount })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(pins ?? []).map((pin) => (
              <div
                key={pin.id}
                className={`flex flex-col gap-2 rounded-xl border p-2 ${pin.inScene ? "border-[var(--primary)]" : "border-[var(--border)] opacity-70"}`}
              >
                <img
                  src={pin.imagePath}
                  alt={pin.caption || localizeUi("ui.chat.forkboard.referencePicture")}
                  className="h-28 w-full rounded-lg object-cover"
                />
                <label className="sr-only" htmlFor={`fork-pin-caption-${pin.id}`}>
                  {localizeUi("ui.chat.forkboard.caption")}
                </label>
                <input
                  id={`fork-pin-caption-${pin.id}`}
                  defaultValue={pin.caption}
                  placeholder={localizeUi("ui.chat.forkboard.captionPlaceholder")}
                  onBlur={(event) => {
                    const caption = event.target.value;
                    if (caption !== pin.caption) updatePin.mutate({ id: pin.id, caption });
                  }}
                  className="min-h-11 rounded-lg bg-[var(--secondary)] px-2 text-sm text-foreground outline-none"
                />
                <label className="sr-only" htmlFor={`fork-pin-category-${pin.id}`}>
                  {localizeUi("ui.chat.forkboard.category")}
                </label>
                <select
                  id={`fork-pin-category-${pin.id}`}
                  value={pin.category}
                  onChange={(event) =>
                    updatePin.mutate({ id: pin.id, category: event.target.value as BoardPinCategory })
                  }
                  className="min-h-11 rounded-lg bg-[var(--secondary)] px-2 text-sm text-foreground outline-none"
                >
                  {BOARD_PIN_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {localizeUi(CATEGORY_LABEL_KEYS[category])}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => updatePin.mutate({ id: pin.id, inScene: !pin.inScene })}
                    aria-pressed={pin.inScene}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--secondary)] text-xs font-semibold text-foreground"
                  >
                    {pin.inScene ? <Pin size="0.75rem" /> : <PinOff size="0.75rem" />}
                    {pin.inScene ? localizeUi("ui.chat.forkboard.inScene") : localizeUi("ui.chat.forkboard.addToScene")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(pin.id)}
                    aria-label={localizeUi("ui.chat.forkboard.removePin")}
                    className="flex min-h-11 w-11 items-center justify-center rounded-lg text-[var(--destructive)]"
                  >
                    <Trash2 size="0.875rem" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
