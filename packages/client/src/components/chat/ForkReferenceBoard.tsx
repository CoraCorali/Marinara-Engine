// ──────────────────────────────────────────────
// Fork: Reference Board — pinned pictures sent with every reply
// ──────────────────────────────────────────────
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical, Plus, Loader2, Pencil, Pin, PinOff } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { FORK_PIN_WHO_PERSONA } from "@marinara-engine/shared";
import { HelpTooltip } from "../ui/HelpTooltip";
import { toast } from "sonner";
import { showConfirmDialog } from "../../lib/app-dialogs";
import {
  BOARD_PIN_CATEGORIES,
  useAddBoardPin,
  useBoardPins,
  useDeleteBoardPin,
  useUpdateBoardPin,
  type BoardPin,
  type BoardScope,
} from "../../hooks/use-fork-board";
import { useGameStateStore } from "../../stores/game-state.store";
import {
  FORK_BOARD_FILTERS,
  FORK_BOARD_FILTER_LABEL_KEYS,
  forkBoardCanReorder,
  forkBoardGroups,
  forkHerePlaceIds,
  forkPinBadges,
  type ForkBoardFilter,
  type ForkBoardGroup,
  type ForkBoardPinLike,
} from "../../lib/fork/board-groups";
import { cn } from "../../lib/utils";
import { Modal } from "../ui/Modal";
import { ForkPinEditor, pinTag, type PinCastMember } from "./ForkPinEditor";
import { ForkCloset } from "./ForkCloset";

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
  /** Who a pin can be about: the persona by name, and the chat's characters. */
  personaName?: string;
  cast?: readonly PinCastMember[];
}

/**
 * Two boards in one panel: this chat's pins, and the persona's own pins that follow them into
 * every chat. A pin that is "in scene" is sent to the model with every reply.
 */
export function ForkReferenceBoard({ chatScope, personaScope, personaName = "", cast = [] }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const [tab, setTab] = useState<"chat" | "persona" | "closet">("chat");
  const [filter, setFilter] = useState<ForkBoardFilter>("all");
  const scope = tab === "persona" ? personaScope : chatScope;
  const { data: pins, isLoading } = useBoardPins(scope);
  // The closet's "Save a look" reads what is on in this chat and on the always-on board.
  const { data: personaPins } = useBoardPins(tab === "closet" ? personaScope : null);
  const addPin = useAddBoardPin(scope);
  const updatePin = useUpdateBoardPin(scope);
  const deletePin = useDeleteBoardPin(scope);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useState<SortMode>("mine");
  // While a pin is dragged the board shows this local order; it is saved when the drag ends.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPin = (pins ?? []).find((pin) => pin.id === editingId) ?? null;

  // Where the story is, from the same world state the HUD reads, so "📍 here" agrees with it.
  const storyLocation = useGameStateStore((state) =>
    state.current && state.current.chatId === chatScope?.scopeId ? state.current.location : null,
  );
  const hereIds = forkHerePlaceIds((pins ?? []) as ForkBoardPinLike[], storyLocation);

  // Order matters: filter first, so a drag never reorders pins the filter is hiding.
  const sorted = sortPins(pins ?? [], sort).filter((pin) => filter === "all" || pin.category === filter);
  const grouped = forkBoardGroups(sorted as ForkBoardPinLike[], filter);
  // Reordering by hand only makes sense on the whole, flat board: a filtered drag would renumber
  // the visible pins only and collide with the hidden ones.
  const canReorder = forkBoardCanReorder(sort, filter, Boolean(grouped));
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

  // Holds an order on screen while it saves. Only the newest save lets go of it, so a drag or a
  // key press started before the last one finished is never snapped back by the older save.
  const saveSeqRef = useRef(0);
  const holdAndSave = (ids: string[]) => {
    const seq = ++saveSeqRef.current;
    setDragOrder(ids);
    void saveOrder(ids).finally(() => {
      if (saveSeqRef.current === seq) setDragOrder(null);
    });
  };

  const moveTo = (ids: string[], id: string, index: number) => {
    const next = ids.filter((entry) => entry !== id);
    next.splice(Math.max(0, Math.min(next.length, index)), 0, id);
    return next;
  };

  // Drag by the handle: the polaroid under the finger takes the dragged one's place. Pointer events
  // rather than HTML drag and drop, because that never fires for a finger on a phone.
  const onHandleDown = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (!canReorder) return;
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
    if (dragOrder) holdAndSave(dragOrder);
    setDraggingId(null);
  };
  // The same handle moves a pin with the arrow keys, for anyone not using a finger or a mouse.
  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (!canReorder) return;
    const ids = shown.map((pin) => pin.id);
    const delta =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : 0;
    if (!delta) return;
    event.preventDefault();
    // Builds on the order still on screen, so three quick presses move the pin three places.
    holdAndSave(moveTo(ids, id, ids.indexOf(id) + delta));
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

  const handleDelete = async (id: string): Promise<boolean> => {
    if (
      !(await showConfirmDialog({
        title: localizeUi("ui.chat.forkboard.removePin"),
        message: localizeUi("ui.chat.forkboard.removePinBody"),
        confirmLabel: localizeUi("ui.chat.forkboard.remove"),
        chatStyle: true,
      }))
    ) {
      return false;
    }
    try {
      await deletePin.mutateAsync(id);
      return true;
    } catch {
      toast.error(localizeUi("ui.chat.forkboard.couldNotRemoveThatPin"));
      return false;
    }
  };

  const inSceneCount = (pins ?? []).filter((pin) => pin.inScene).length;
  // A pin's "who" is "persona" or a character id; badges show the name a person would read.
  const nameFor = (id: string) =>
    id === FORK_PIN_WHO_PERSONA ? personaName : (cast.find((member) => member.id === id)?.name ?? id);

  /** One polaroid. Grouped and flat grids render the same card. */
  const renderPin = (pin: BoardPin, index: number) => (
    <div
      key={pin.id}
      data-pin-id={pin.id}
      // A little tilt either way, like photos pinned up by hand.
      style={{
        transform: draggingId === pin.id ? "scale(1.04)" : `rotate(${index % 2 === 0 ? -1.2 : 1}deg)`,
      }}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 rounded-sm bg-[#fbf8f2] p-1.5 pb-0.5 shadow-[0_5px_12px_rgba(0,0,0,0.35)] transition-transform",
        !pin.inScene && "opacity-60 saturate-50",
        draggingId === pin.id && "z-10 shadow-[0_14px_30px_rgba(0,0,0,0.5)]",
      )}
    >
      {pin.inScene && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 left-1/2 h-3 w-10 -translate-x-1/2 rotate-[-3deg] rounded-[2px] bg-[color-mix(in_srgb,var(--primary)_55%,white)] opacity-80"
        />
      )}
      {/* The badges sit over the picture, the way a sticker would. */}
      {badgesFor(pin).length > 0 && (
        <span className="pointer-events-none absolute top-1 right-1 z-10 flex max-w-[92%] flex-wrap justify-end gap-1">
          {badgesFor(pin).map((badge) => (
            <span
              key={badge.key}
              className={cn(
                "rounded-full px-1.5 py-px text-[0.5625rem] font-bold whitespace-nowrap shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
                badge.warn ? "bg-[#ffb36b] text-[#3a1f06]" : "bg-[#2b1838]/85 text-white",
              )}
            >
              {badge.values ? localizeUi(badge.key, badge.values) : localizeUi(badge.key)}
            </span>
          ))}
        </span>
      )}
      {/* Tapping the picture opens the pin: who it is for, what it is, Describe it. */}
      <button
        type="button"
        onClick={() => setEditingId(pin.id)}
        aria-label={localizeUi("ui.chat.forkboard.editPin")}
        className="block"
      >
        <img
          src={pin.imagePath}
          alt={pin.caption || localizeUi("ui.chat.forkboard.referencePicture")}
          className="aspect-square w-full object-cover"
          draggable={false}
        />
      </button>
      <p
        className={cn(
          "line-clamp-2 min-h-[2lh] px-0.5 text-center font-serif text-[0.6875rem] italic leading-snug",
          // Written on the polaroid itself, so it keeps the paper's ink whatever the theme.
          pin.name || pin.caption ? "text-[#3a3330]" : "text-[#8d8580]",
        )}
      >
        {pin.name || pin.caption || localizeUi("ui.chat.forkboard.tapToDescribe")}
      </p>
      <span className="mx-auto max-w-full truncate rounded-full bg-[#efe9df] px-1.5 py-px text-[0.625rem] font-semibold text-[#3a3330]">
        {pinTag(pin, personaName, cast, localizeUi)}
      </span>
      <div className="flex items-center justify-between">
        {canReorder ? (
          <button
            type="button"
            onPointerDown={(event) => onHandleDown(event, pin.id)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onKeyDown={(event) => onHandleKey(event, pin.id)}
            aria-label={localizeUi("ui.chat.forkboard.dragToReorder")}
            title={localizeUi("ui.chat.forkboard.dragToReorder")}
            className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[#8d8580] active:cursor-grabbing"
          >
            <GripVertical size="0.75rem" />
          </button>
        ) : (
          <span className="h-8 w-8" />
        )}
        <button
          type="button"
          onClick={() => updatePin.mutate({ id: pin.id, inScene: !pin.inScene })}
          aria-pressed={pin.inScene}
          aria-label={
            pin.inScene ? localizeUi("ui.chat.forkboard.inScene") : localizeUi("ui.chat.forkboard.addToScene")
          }
          title={pin.inScene ? localizeUi("ui.chat.forkboard.inScene") : localizeUi("ui.chat.forkboard.addToScene")}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded",
            pin.inScene ? "text-[var(--primary)]" : "text-[#8d8580]",
          )}
        >
          {pin.inScene ? <Pin size="0.75rem" /> : <PinOff size="0.75rem" />}
        </button>
        <button
          type="button"
          onClick={() => setEditingId(pin.id)}
          aria-label={localizeUi("ui.chat.forkboard.editPin")}
          title={localizeUi("ui.chat.forkboard.editPin")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#8d8580]"
        >
          <Pencil size="0.75rem" />
        </button>
      </div>
    </div>
  );

  function badgesFor(pin: BoardPin) {
    return forkPinBadges(pin as ForkBoardPinLike, { here: hereIds.has(pin.id), nameFor });
  }

  /** A group's heading: "Theo's apartment · 3 rooms", "Kyli's things · 2". */
  const groupTitle = (group: ForkBoardGroup) => {
    if (group.kind === "building") {
      return group.title
        ? { title: group.title, count: localizeUi("ui.chat.forkboard.roomsCount", { count: group.pins.length }) }
        : {
            title: localizeUi("ui.chat.forkboard.groupOtherPlaces"),
            count: localizeUi("ui.chat.forkboard.groupCount", { count: group.pins.length }),
          };
    }
    if (group.kind === "owner") {
      return {
        title: localizeUi("ui.chat.forkboard.thingsOf", { name: nameFor(group.title) || group.title }),
        count: localizeUi("ui.chat.forkboard.groupCount", { count: group.pins.length }),
      };
    }
    return {
      title: localizeUi("ui.chat.forkboard.groupShared"),
      count: localizeUi("ui.chat.forkboard.groupCount", { count: group.pins.length }),
    };
  };

  return (
    <div className="fork-ui flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-[var(--secondary)] p-1">
          <button
            type="button"
            onClick={() => setTab("chat")}
            className={`min-h-8 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold ${tab === "chat" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-foreground/70"}`}
          >
            {localizeUi("ui.chat.forkboard.thisChat")}
          </button>
          <button
            type="button"
            onClick={() => setTab("persona")}
            disabled={!personaScope}
            title={personaScope ? undefined : localizeUi("ui.chat.forkboard.pickAPersonaFirst")}
            className={`min-h-8 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold disabled:opacity-40 ${tab === "persona" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-foreground/70"}`}
          >
            {localizeUi("ui.chat.forkboard.alwaysOn")}
          </button>
          <button
            type="button"
            onClick={() => setTab("closet")}
            className={`min-h-8 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold ${tab === "closet" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-foreground/70"}`}
          >
            {localizeUi("ui.chat.forkcloset.tab")}
          </button>
        </div>
        {tab !== "closet" && (
          <>
            <HelpTooltip
              buttonClassName="-m-2 p-2"
              text={
                tab === "chat"
                  ? localizeUi("ui.chat.forkboard.thisChatHelp")
                  : localizeUi("ui.chat.forkboard.alwaysOnHelp")
              }
              side="bottom"
              wide
              size="0.875rem"
            />
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!scope || addPin.isPending}
              className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--primary)] px-3.5 text-[0.8125rem] font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
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
          </>
        )}
      </div>

      {tab === "closet" ? (
        <ForkCloset
          chatId={chatScope?.scopeId ?? null}
          boardPins={[...(pins ?? []), ...(personaPins ?? [])]}
          personaName={personaName}
          cast={cast}
        />
      ) : !scope ? (
        <p className="py-6 text-center text-[0.8125rem] text-[var(--muted-foreground)]">
          {localizeUi("ui.chat.forkboard.pickAPersonaFirst")}
        </p>
      ) : isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 size="1.25rem" className="animate-spin text-[var(--muted-foreground)]" />
        </div>
      ) : (pins ?? []).length === 0 ? (
        <p className="py-6 text-center text-[0.8125rem] text-[var(--muted-foreground)]">
          {localizeUi("ui.chat.forkboard.noPinsYet")}
        </p>
      ) : (
        <>
          {/* Category chips: All, clothes, places, things, people, vibes. */}
          <div className="flex flex-wrap gap-1.5">
            {FORK_BOARD_FILTERS.map((option) => {
              const count =
                option === "all" ? (pins ?? []).length : (pins ?? []).filter((pin) => pin.category === option).length;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  disabled={count === 0 && option !== "all"}
                  className={cn(
                    "flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold transition-colors disabled:opacity-40",
                    filter === option
                      ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "border-[var(--border)] text-foreground/85 hover:bg-foreground/10",
                  )}
                >
                  {localizeUi(FORK_BOARD_FILTER_LABEL_KEYS[option])}
                  <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

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
              className="min-h-9 rounded-xl bg-[var(--secondary)] px-2.5 text-xs font-semibold text-foreground outline-none"
            >
              {(Object.keys(SORT_LABEL_KEYS) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {localizeUi(SORT_LABEL_KEYS[mode])}
                </option>
              ))}
            </select>
          </div>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-[0.8125rem] text-[var(--muted-foreground)]">
              {localizeUi("ui.chat.forkboard.nothingInCategory")}
            </p>
          ) : grouped ? (
            <div className="flex flex-col gap-4">
              {grouped.map((group) => {
                const heading = groupTitle(group);
                return (
                  <div key={group.key} className="flex flex-col gap-1.5">
                    <p className="m-0 flex items-baseline justify-between gap-2 text-[0.75rem] font-bold text-foreground/85">
                      <span className="min-w-0 truncate">{heading.title}</span>
                      <span className="shrink-0 font-semibold text-[var(--muted-foreground)]">{heading.count}</span>
                    </p>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-3 px-0.5">
                      {group.pins.map((pin, index) => renderPin(pin as BoardPin, index))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-2 gap-y-3 px-0.5 pt-1.5">
              {shown.map((pin, index) => renderPin(pin, index))}
            </div>
          )}

          <Modal
            open={editingPin !== null}
            onClose={() => setEditingId(null)}
            title={localizeUi("ui.chat.forkboard.editPin")}
            width="max-w-md"
            mobileFullscreen
          >
            {editingPin && (
              <ForkPinEditor
                pin={editingPin}
                scope={scope}
                chatId={chatScope?.scopeId ?? null}
                personaName={personaName}
                cast={cast}
                allPins={pins ?? []}
                onDelete={() => {
                  const id = editingPin.id;
                  void handleDelete(id).then((removed) => {
                    if (removed) setEditingId(null);
                  });
                }}
              />
            )}
          </Modal>
        </>
      )}
    </div>
  );
}
