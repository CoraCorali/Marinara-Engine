// ──────────────────────────────────────────────
// Fork: Reference Board — pinned pictures sent with every reply
// ──────────────────────────────────────────────
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical, Plus, Trash2, Loader2, Pin, PinOff } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import {
  BOARD_PIN_CATEGORIES,
  useAddBoardPin,
  useBoardPins,
  useDeleteBoardPin,
  useUpdateBoardPin,
  type BoardPin,
  type BoardPinCategory,
  type BoardScope,
} from "../../hooks/use-fork-board";
import { cn } from "../../lib/utils";

const CATEGORY_LABEL_KEYS: Record<BoardPinCategory, string> = {
  wearing: "ui.chat.forkboard.categoryWearing",
  place: "ui.chat.forkboard.categoryPlace",
  person: "ui.chat.forkboard.categoryPerson",
  thing: "ui.chat.forkboard.categoryThing",
  vibe: "ui.chat.forkboard.categoryVibe",
};

/** A caption that saves a moment after you stop typing, and on close, rather than only on blur. */
function CaptionInput({
  id,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder: string;
  onCommit: (caption: string) => void;
}) {
  const [draft, change, flush] = useForkDraftField(value, onCommit);
  return (
    <textarea
      id={id}
      rows={1}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => change(event.target.value)}
      onBlur={flush}
      // Written on the polaroid itself, so it keeps the paper's ink whatever the theme.
      className="min-h-10 w-full resize-none bg-transparent px-1 py-2 text-center font-serif text-sm italic leading-snug text-[#3a3330] outline-none [field-sizing:content] placeholder:text-[#8d8580]"
    />
  );
}

type SortMode = "mine" | "inScene" | "category" | "newest";
const SORT_LABEL_KEYS: Record<SortMode, string> = {
  mine: "ui.chat.forkboard.sortMine",
  inScene: "ui.chat.forkboard.sortInScene",
  category: "ui.chat.forkboard.sortCategory",
  newest: "ui.chat.forkboard.sortNewest",
};

function sortPins(pins: readonly BoardPin[], mode: SortMode): BoardPin[] {
  const list = [...pins];
  if (mode === "inScene") return list.sort((a, b) => Number(b.inScene) - Number(a.inScene) || a.order - b.order);
  if (mode === "category") {
    return list.sort(
      (a, b) =>
        BOARD_PIN_CATEGORIES.indexOf(a.category) - BOARD_PIN_CATEGORIES.indexOf(b.category) || a.order - b.order,
    );
  }
  // Reordering changes `order`, so "newest" goes by when the pin was added.
  if (mode === "newest")
    return list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.order - a.order);
  return list.sort((a, b) => a.order - b.order);
}

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
  const [sort, setSort] = useState<SortMode>("mine");
  // While a pin is dragged the board shows this local order; it is saved when the drag ends.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sorted = sortPins(pins ?? [], sort);
  const shown = dragOrder
    ? dragOrder.map((id) => sorted.find((pin) => pin.id === id)).filter((pin): pin is BoardPin => Boolean(pin))
    : sorted;

  /** Saves a new order, writing only the pins whose place changed. */
  const saveOrder = (ids: string[]) =>
    Promise.allSettled(
      ids.flatMap((id, index) => {
        const pin = (pins ?? []).find((entry) => entry.id === id);
        return pin && pin.order !== index ? [updatePin.mutateAsync({ id, order: index })] : [];
      }),
    );

  const moveTo = (ids: string[], id: string, index: number) => {
    const next = ids.filter((entry) => entry !== id);
    next.splice(Math.max(0, Math.min(next.length, index)), 0, id);
    return next;
  };

  // Drag by the handle: the polaroid under the finger takes the dragged one's place. Pointer events
  // rather than HTML drag and drop, because that never fires for a finger on a phone.
  const onHandleDown = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (sort !== "mine") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
    setDragOrder(shown.map((pin) => pin.id));
  };
  const onHandleMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggingId || !dragOrder) return;
    const over = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest("[data-pin-id]")?.getAttribute("data-pin-id"))
      .find((id) => id && id !== draggingId);
    if (!over) return;
    setDragOrder(moveTo(dragOrder, draggingId, dragOrder.indexOf(over)));
  };
  // The dragged order stays on screen until every save has landed, so nothing jumps back mid-save.
  const onHandleUp = () => {
    if (draggingId && dragOrder) void saveOrder(dragOrder).finally(() => setDragOrder(null));
    else setDragOrder(null);
    setDraggingId(null);
  };
  // The same handle moves a pin with the arrow keys, for anyone not using a finger or a mouse.
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (sort !== "mine") return;
    const ids = shown.map((pin) => pin.id);
    const delta =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : 0;
    if (!delta) return;
    event.preventDefault();
    void saveOrder(moveTo(ids, id, ids.indexOf(id) + delta));
  };

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
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs font-semibold text-[var(--muted-foreground)]">
              {localizeUi("ui.chat.forkboard.value1InScene", { value1: inSceneCount })}
            </p>
            <label className="sr-only" htmlFor="fork-board-sort">
              {localizeUi("ui.chat.forkboard.sort")}
            </label>
            <select
              id="fork-board-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="min-h-11 rounded-xl bg-[var(--secondary)] px-2.5 text-xs font-semibold text-foreground outline-none"
            >
              {(Object.keys(SORT_LABEL_KEYS) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {localizeUi(SORT_LABEL_KEYS[mode])}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-1 pt-2">
            {shown.map((pin, index) => (
              <div
                key={pin.id}
                data-pin-id={pin.id}
                // A little tilt either way, like photos pinned up by hand.
                style={{
                  transform: draggingId === pin.id ? "scale(1.04)" : `rotate(${index % 2 === 0 ? -1.4 : 1.2}deg)`,
                }}
                className={cn(
                  "relative flex flex-col gap-1 rounded-sm bg-[#fbf8f2] p-2 pb-1 shadow-[0_6px_16px_rgba(0,0,0,0.35)] transition-transform",
                  !pin.inScene && "opacity-60 saturate-50",
                  draggingId === pin.id && "z-10 shadow-[0_14px_30px_rgba(0,0,0,0.5)]",
                )}
              >
                {pin.inScene && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 rotate-[-3deg] rounded-[2px] bg-[color-mix(in_srgb,var(--primary)_55%,white)] opacity-80"
                  />
                )}
                <img
                  src={pin.imagePath}
                  alt={pin.caption || localizeUi("ui.chat.forkboard.referencePicture")}
                  className="aspect-square w-full object-cover"
                  draggable={false}
                />
                <label className="sr-only" htmlFor={`fork-pin-caption-${pin.id}`}>
                  {localizeUi("ui.chat.forkboard.caption")}
                </label>
                <CaptionInput
                  id={`fork-pin-caption-${pin.id}`}
                  value={pin.caption}
                  placeholder={localizeUi("ui.chat.forkboard.captionPlaceholder")}
                  onCommit={(caption) => updatePin.mutate({ id: pin.id, caption })}
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
                  className="min-h-9 w-full rounded-full bg-[#efe9df] px-2 text-center text-xs font-semibold text-[#3a3330] outline-none"
                >
                  {BOARD_PIN_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {localizeUi(CATEGORY_LABEL_KEYS[category])}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between gap-0.5">
                  {sort === "mine" && (
                    <button
                      type="button"
                      onPointerDown={(event) => onHandleDown(event, pin.id)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                      onKeyDown={(event) => onHandleKey(event, pin.id)}
                      aria-label={localizeUi("ui.chat.forkboard.dragToReorder")}
                      title={localizeUi("ui.chat.forkboard.dragToReorder")}
                      className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[#8d8580] active:cursor-grabbing"
                    >
                      <GripVertical size="0.875rem" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => updatePin.mutate({ id: pin.id, inScene: !pin.inScene })}
                    aria-pressed={pin.inScene}
                    aria-label={
                      pin.inScene ? localizeUi("ui.chat.forkboard.inScene") : localizeUi("ui.chat.forkboard.addToScene")
                    }
                    title={
                      pin.inScene ? localizeUi("ui.chat.forkboard.inScene") : localizeUi("ui.chat.forkboard.addToScene")
                    }
                    className={cn(
                      "flex h-11 w-9 shrink-0 items-center justify-center rounded",
                      pin.inScene ? "text-[var(--primary)]" : "text-[#8d8580]",
                    )}
                  >
                    {pin.inScene ? <Pin size="0.875rem" /> : <PinOff size="0.875rem" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(pin.id)}
                    aria-label={localizeUi("ui.chat.forkboard.removePin")}
                    className="flex h-11 w-9 shrink-0 items-center justify-center rounded text-[#b04a3f]"
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
