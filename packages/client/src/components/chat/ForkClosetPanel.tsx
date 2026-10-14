// ──────────────────────────────────────────────
// Fork: the Closet — a persona's wardrobe, and what she has on
// ──────────────────────────────────────────────
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Plus, Trash2, Loader2, Shirt, Sparkles } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import {
  CLOSET_SLOTS,
  useAddClosetItem,
  useClosetItems,
  useDeleteClosetItem,
  useUpdateClosetItem,
  useGenerateClosetItem,
  useWearClosetItem,
  type ClosetItem,
  type ClosetSlot,
} from "../../hooks/use-fork-closet";

const SLOT_LABEL_KEYS: Record<ClosetSlot, string> = {
  dress: "ui.chat.forkcloset.slotDress",
  top: "ui.chat.forkcloset.slotTop",
  bottom: "ui.chat.forkcloset.slotBottom",
  outer: "ui.chat.forkcloset.slotOuter",
  shoes: "ui.chat.forkcloset.slotShoes",
  bag: "ui.chat.forkcloset.slotBag",
  jewellery: "ui.chat.forkcloset.slotJewellery",
  extra: "ui.chat.forkcloset.slotExtra",
};

/** A label that saves a moment after you stop typing, not once per keystroke. */
function DraftLabel({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  ariaLabel: string;
}) {
  const [draft, change, flush] = useForkDraftField(value, onCommit);
  return (
    <input
      value={draft}
      onChange={(event) => change(event.target.value)}
      onBlur={flush}
      aria-label={ariaLabel}
      className="mt-1 w-16 bg-transparent text-[0.625rem] text-[var(--foreground)]/80 outline-none"
    />
  );
}

interface Props {
  personaId: string | null;
  personaName: string;
}

/**
 * One rail per slot. Tapping a piece puts it on, and whatever it cannot be worn beside comes off
 * by itself: a dress replaces a top and a bottom, and either of those replaces the dress. What she
 * has on rides along with every reply, as pictures and as a line of text.
 */
export function ForkClosetPanel({ personaId, personaName }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const { data: items, isLoading } = useClosetItems(personaId);
  const addItem = useAddClosetItem(personaId);
  const updateItem = useUpdateClosetItem(personaId);
  const wearItem = useWearClosetItem(personaId);
  const deleteItem = useDeleteClosetItem(personaId);
  const drawItem = useGenerateClosetItem(personaId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingSlot, setPendingSlot] = useState<ClosetSlot>("top");
  const [wanted, setWanted] = useState("");

  const bySlot = useMemo(() => {
    const map = new Map<ClosetSlot, ClosetItem[]>();
    for (const slot of CLOSET_SLOTS) map.set(slot, []);
    for (const item of items ?? []) map.get(item.slot)?.push(item);
    return map;
  }, [items]);

  const worn = useMemo(() => (items ?? []).filter((item) => item.worn), [items]);
  // The first piece she added is the style reference: a new skirt should look like it belongs
  // beside the ones already hanging up.
  const styleReference = (items ?? [])[0] ?? null;

  if (!personaId) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
        {localizeUi("ui.chat.forkcloset.pickAPersonaFirst")}
      </p>
    );
  }

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await addItem.mutateAsync({ file, slot: pendingSlot, label: file.name.replace(/\.[^.]+$/, "").slice(0, 60) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkcloset.couldNotAddThatPiece"));
    }
  };

  return (
    <div className="flex max-h-[70vh] min-h-[22rem] flex-col gap-3">
      <div className="flex items-start gap-2">
        <Shirt size="0.875rem" className="mt-0.5 shrink-0 text-[var(--primary)]" />
        <p className="text-xs text-[var(--muted-foreground)]">
          {worn.length > 0
            ? localizeUi("ui.chat.forkcloset.wearingValue1", {
                value1: worn.map((item) => item.label || item.slot).join(", "),
              })
            : localizeUi("ui.chat.forkcloset.nothingOnYet", { value1: personaName })}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 size="1.25rem" className="animate-spin text-[var(--muted-foreground)]" />
          </div>
        )}

        {!isLoading &&
          CLOSET_SLOTS.map((slot) => {
            const slotItems = bySlot.get(slot) ?? [];
            if (slotItems.length === 0) return null;
            return (
              <div key={slot}>
                <div className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                  {localizeUi(SLOT_LABEL_KEYS[slot])}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {slotItems.map((item) => (
                    <div key={item.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => wearItem.mutate({ id: item.id, worn: !item.worn })}
                        aria-pressed={item.worn}
                        aria-label={
                          item.worn
                            ? localizeUi("ui.chat.forkcloset.takeOffValue1", { value1: item.label || slot })
                            : localizeUi("ui.chat.forkcloset.wearValue1", { value1: item.label || slot })
                        }
                        className={
                          "relative block h-20 w-16 overflow-hidden rounded-lg border-2 bg-[var(--secondary)] " +
                          (item.worn ? "border-[var(--primary)]" : "border-transparent")
                        }
                      >
                        <img src={item.imagePath} alt="" className="h-full w-full object-contain" />
                      </button>
                      <DraftLabel
                        value={item.label}
                        onCommit={(label) => updateItem.mutate({ id: item.id, label })}
                        ariaLabel={localizeUi("ui.chat.forkcloset.whatThisPieceIs")}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await showConfirmDialog({
                            title: localizeUi("ui.chat.forkcloset.removeThisPiece"),
                            message: localizeUi("ui.chat.forkcloset.removeThisPieceBody"),
                            confirmLabel: localizeUi("ui.chat.forkcloset.remove"),
                          });
                          if (ok) deleteItem.mutate(item.id);
                        }}
                        aria-label={localizeUi("ui.chat.forkcloset.removeValue1", { value1: item.label || slot })}
                        className="mt-0.5 flex h-6 w-16 items-center justify-center rounded text-[var(--muted-foreground)]"
                      >
                        <Trash2 size="0.75rem" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

        {!isLoading && (items ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            {localizeUi("ui.chat.forkcloset.emptyHint")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="fork-closet-draw">
          {localizeUi("ui.chat.forkcloset.describeAPiece")}
        </label>
        <input
          id="fork-closet-draw"
          value={wanted}
          onChange={(event) => setWanted(event.target.value)}
          placeholder={localizeUi("ui.chat.forkcloset.describeAPiece")}
          className="min-h-11 flex-1 rounded-lg bg-[var(--secondary)] px-3 text-sm text-foreground outline-none"
        />
        <button
          type="button"
          onClick={async () => {
            const description = wanted.trim();
            if (!description) return;
            try {
              await drawItem.mutateAsync({
                description,
                slot: pendingSlot,
                ...(styleReference ? { referencePath: styleReference.imagePath } : {}),
              });
              setWanted("");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkcloset.couldNotDrawThat"));
            }
          }}
          disabled={drawItem.isPending || wanted.trim().length === 0}
          aria-label={localizeUi("ui.chat.forkcloset.drawIt")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] disabled:opacity-50"
        >
          {drawItem.isPending ? <Loader2 size="0.875rem" className="animate-spin" /> : <Sparkles size="0.875rem" />}
        </button>
      </div>

      <p className="text-[0.625rem] text-[var(--muted-foreground)]">
        {styleReference
          ? localizeUi("ui.chat.forkcloset.drawnToMatchValue1", { value1: styleReference.label || "the first piece" })
          : localizeUi("ui.chat.forkcloset.addOnePieceFirst")}
      </p>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="fork-closet-slot">
          {localizeUi("ui.chat.forkcloset.whichSlot")}
        </label>
        <select
          id="fork-closet-slot"
          value={pendingSlot}
          onChange={(event) => setPendingSlot(event.target.value as ClosetSlot)}
          className="min-h-11 rounded-lg bg-[var(--secondary)] px-3 text-sm text-foreground outline-none"
        >
          {CLOSET_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {localizeUi(SLOT_LABEL_KEYS[slot])}
            </option>
          ))}
        </select>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={addItem.isPending}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {addItem.isPending ? <Loader2 size="0.875rem" className="animate-spin" /> : <Plus size="0.875rem" />}
          {localizeUi("ui.chat.forkcloset.addAPiece")}
        </button>
      </div>
    </div>
  );
}
