// ──────────────────────────────────────────────
// Fork: the closet — saved outfits you can put on anyone, in any chat
// ──────────────────────────────────────────────
import { useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, Loader2, Plus, Shirt, Trash2 } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FORK_PIN_WHO_PERSONA } from "@marinara-engine/shared";
import { api } from "../../lib/api-client";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { cn } from "../../lib/utils";
import {
  useClosetOutfits,
  useCreateOutfit,
  useDeleteOutfit,
  useRenameOutfit,
  useWearOutfit,
  type BoardPin,
  type ClosetOutfit,
} from "../../hooks/use-fork-board";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import { HelpTooltip } from "../ui/HelpTooltip";
import { Modal } from "../ui/Modal";
import { ForkPinEditor, type PinCastMember } from "./ForkPinEditor";

const CHIP =
  "flex min-h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors";
const CHIP_ON = "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]";
const CHIP_OFF = "border-[var(--border)] text-foreground/85 hover:bg-foreground/10";
const SOFT_BUTTON =
  "flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[0.8125rem] font-semibold";

/** Pictures go up one by one into an outfit, the same way the board takes them. */
async function uploadPieces(outfitId: string, files: readonly File[]) {
  for (const file of files) {
    const form = new FormData();
    form.append("scopeType", "outfit");
    form.append("scopeId", outfitId);
    form.append("category", "wearing");
    form.append("file", file);
    await api.upload<BoardPin>("/fork-board/pins", form);
  }
}

/** Up to four pieces in a square, like a folded stack of clothes. */
function Collage({ pieces }: { pieces: readonly BoardPin[] }) {
  const shown = pieces.slice(0, 4);
  if (shown.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--muted-foreground)]">
        <Shirt size="1.5rem" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "grid aspect-square w-full gap-0.5 overflow-hidden rounded-xl bg-[var(--secondary)]",
        shown.length > 1 && "grid-cols-2",
      )}
    >
      {shown.map((piece, index) => (
        <img
          key={piece.id}
          src={piece.imagePath}
          alt=""
          draggable={false}
          className={cn("h-full w-full object-cover", shown.length === 3 && index === 0 && "row-span-2")}
        />
      ))}
    </div>
  );
}

function OutfitName({ outfit }: { outfit: ClosetOutfit }) {
  const { t: localizeUi } = useUiTranslation();
  const rename = useRenameOutfit();
  const [name, change, flush] = useForkDraftField(outfit.name, (value: string) => {
    if (value.trim()) rename.mutate({ id: outfit.id, name: value });
  });
  return (
    <input
      value={name}
      onChange={(event) => change(event.target.value)}
      onBlur={flush}
      maxLength={60}
      aria-label={localizeUi("ui.chat.forkcloset.outfitName")}
      className="min-h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 text-[0.8125rem] font-semibold text-foreground outline-none"
    />
  );
}

/** One outfit opened up: its name, its pieces (each with Describe it), more pictures, delete. */
function OutfitSheet({
  outfit,
  chatId,
  personaName,
  cast,
  onClose,
}: {
  outfit: ClosetOutfit;
  chatId: string | null;
  personaName: string;
  cast: readonly PinCastMember[];
  onClose: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const qc = useQueryClient();
  const deleteOutfit = useDeleteOutfit();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pieceId, setPieceId] = useState<string | null>(null);
  const piece = outfit.pieces.find((entry) => entry.id === pieceId) ?? null;

  const addPictures = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      await uploadPieces(outfit.id, files);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkcloset.couldNotSave"));
    } finally {
      setUploading(false);
      void qc.invalidateQueries({ queryKey: ["fork-closet"] });
    }
  };

  if (piece) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setPieceId(null)}
          className="flex min-h-8 items-center gap-1 self-start rounded-full px-2 text-xs font-semibold text-[var(--muted-foreground)] hover:text-foreground"
        >
          <ArrowLeft size="0.75rem" />
          {outfit.name}
        </button>
        <ForkPinEditor
          pin={piece}
          scope={{ scopeType: "outfit", scopeId: outfit.id }}
          chatId={chatId}
          personaName={personaName}
          cast={cast}
          closet
          onDelete={async () => {
            const ok = await showConfirmDialog({
              title: localizeUi("ui.chat.forkcloset.removePiece"),
              message: localizeUi("ui.chat.forkcloset.removePieceBody"),
              confirmLabel: localizeUi("ui.chat.forkboard.remove"),
              chatStyle: true,
            });
            if (!ok) return;
            try {
              await api.delete(`/fork-board/pins/${piece.id}`);
              setPieceId(null);
            } catch {
              toast.error(localizeUi("ui.chat.forkcloset.couldNotSave"));
            } finally {
              void qc.invalidateQueries({ queryKey: ["fork-closet"] });
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="fork-ui flex flex-col gap-3">
      <OutfitName outfit={outfit} />
      <div className="grid grid-cols-3 gap-2">
        {outfit.pieces.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setPieceId(entry.id)}
            aria-label={entry.caption || localizeUi("ui.chat.forkboard.editPin")}
            className="flex min-w-0 flex-col gap-1 rounded-lg bg-[var(--secondary)] p-1 text-left"
          >
            <img src={entry.imagePath} alt="" draggable={false} className="aspect-square w-full rounded object-cover" />
            <span className="line-clamp-2 min-h-[2lh] px-0.5 text-[0.6875rem] leading-snug text-[var(--muted-foreground)]">
              {entry.caption || localizeUi("ui.chat.forkboard.tapToDescribe")}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] text-xs font-semibold text-[var(--muted-foreground)] disabled:opacity-60"
        >
          {uploading ? <Loader2 size="1rem" className="animate-spin" /> : <Plus size="1rem" />}
          {localizeUi("ui.chat.forkcloset.addPictures")}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={addPictures}
      />
      <button
        type="button"
        onClick={async () => {
          const ok = await showConfirmDialog({
            title: localizeUi("ui.chat.forkcloset.deleteOutfit"),
            message: localizeUi("ui.chat.forkcloset.deleteOutfitBody", { name: outfit.name }),
            confirmLabel: localizeUi("ui.chat.forkboard.remove"),
            chatStyle: true,
          });
          if (ok) deleteOutfit.mutate(outfit.id, { onSuccess: onClose });
        }}
        className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--destructive)]"
      >
        <Trash2 size="0.75rem" />
        {localizeUi("ui.chat.forkcloset.deleteOutfit")}
      </button>
    </div>
  );
}

/**
 * The closet tab of the board. Outfits are kept outside any chat, so a look saved once can be put
 * on you or a character in a new chat with one tap.
 */
export function ForkCloset({
  chatId,
  boardPins,
  personaName,
  cast,
}: {
  chatId: string | null;
  /** What is pinned in this chat and on your always-on board, for "Save a look". */
  boardPins: readonly BoardPin[];
  personaName: string;
  cast: readonly PinCastMember[];
}) {
  const { t: localizeUi } = useUiTranslation();
  const qc = useQueryClient();
  const { data: outfits, isLoading } = useClosetOutfits();
  const createOutfit = useCreateOutfit();
  const wearOutfit = useWearOutfit(chatId);
  const newFileRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [wearingId, setWearingId] = useState<string | null>(null);
  const [savingLook, setSavingLook] = useState(false);
  const [lookWho, setLookWho] = useState("");
  const [lookName, setLookName] = useState("");
  const open = (outfits ?? []).find((outfit) => outfit.id === openId) ?? null;
  const toWear = (outfits ?? []).find((outfit) => outfit.id === wearingId) ?? null;

  const people: { id: string; name: string }[] = [
    ...(personaName ? [{ id: FORK_PIN_WHO_PERSONA, name: personaName }] : []),
    ...cast.map((member) => ({ id: member.id, name: member.name })),
  ];
  const nameOf = (who: string) => people.find((person) => person.id === who)?.name ?? "";
  // Whoever has something on right now, for "Save a look".
  const wornBy = (who: string) =>
    boardPins.filter((pin) => pin.inScene && pin.category === "wearing" && pin.who === who);
  const dressed = people.filter((person) => wornBy(person.id).length > 0);

  const newOutfit = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setCreating(true);
    try {
      const outfit = await createOutfit.mutateAsync({ name: localizeUi("ui.chat.forkcloset.newOutfitName") });
      await uploadPieces(outfit.id, files);
      setOpenId(outfit.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkcloset.couldNotSave"));
    } finally {
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ["fork-closet"] });
    }
  };

  const startSaveLook = () => {
    const first = dressed[0]?.id ?? "";
    setLookWho(first);
    setLookName(first ? localizeUi("ui.chat.forkcloset.lookName", { name: nameOf(first) }) : "");
    setSavingLook(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={startSaveLook}
          disabled={dressed.length === 0}
          title={dressed.length === 0 ? localizeUi("ui.chat.forkcloset.nobodyDressed") : undefined}
          className={cn(SOFT_BUTTON, "bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50")}
        >
          <Shirt size="0.875rem" />
          {localizeUi("ui.chat.forkcloset.saveLook")}
        </button>
        <button
          type="button"
          onClick={() => newFileRef.current?.click()}
          disabled={creating}
          className={cn(
            SOFT_BUTTON,
            "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-[var(--primary)] disabled:opacity-60",
          )}
        >
          {creating ? <Loader2 size="0.875rem" className="animate-spin" /> : <Plus size="0.875rem" />}
          {localizeUi("ui.chat.forkcloset.newOutfit")}
        </button>
        <HelpTooltip
          buttonClassName="-m-2 p-2"
          text={localizeUi("ui.chat.forkcloset.help")}
          side="bottom"
          wide
          size="0.875rem"
        />
        <input
          ref={newFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={newOutfit}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 size="1.25rem" className="animate-spin text-[var(--muted-foreground)]" />
        </div>
      ) : (outfits ?? []).length === 0 ? (
        <p className="py-6 text-center text-[0.8125rem] text-[var(--muted-foreground)]">
          {localizeUi("ui.chat.forkcloset.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {(outfits ?? []).map((outfit) => (
            <div key={outfit.id} className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-[var(--card)] p-1.5">
              <button
                type="button"
                onClick={() => setOpenId(outfit.id)}
                aria-label={localizeUi("ui.chat.forkcloset.openOutfit", { name: outfit.name })}
                className="block"
              >
                <Collage pieces={outfit.pieces} />
              </button>
              <div className="flex min-w-0 items-center gap-1 px-0.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-bold text-foreground">{outfit.name}</span>
                  <span className="block text-[0.6875rem] text-[var(--muted-foreground)]">
                    {localizeUi("ui.chat.forkcloset.pieceCount", { count: outfit.pieces.length })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setWearingId(outfit.id)}
                  disabled={!chatId || outfit.pieces.length === 0}
                  className="min-h-8 shrink-0 rounded-full bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
                >
                  {localizeUi("ui.chat.forkcloset.wear")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={localizeUi("ui.chat.forkcloset.outfit")}
        width="max-w-md"
        mobileFullscreen
      >
        {open && (
          <OutfitSheet
            outfit={open}
            chatId={chatId}
            personaName={personaName}
            cast={cast}
            onClose={() => setOpenId(null)}
          />
        )}
      </Modal>

      <Modal
        open={toWear !== null}
        onClose={() => setWearingId(null)}
        title={localizeUi("ui.chat.forkcloset.whoWearsIt", { name: toWear?.name ?? "" })}
        width="max-w-sm"
      >
        <div className="fork-ui flex flex-wrap gap-1.5">
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              disabled={wearOutfit.isPending}
              onClick={() =>
                toWear &&
                wearOutfit.mutate(
                  { id: toWear.id, who: person.id },
                  {
                    onSuccess: () => {
                      toast.success(
                        localizeUi("ui.chat.forkcloset.nowWearing", { who: person.name, name: toWear.name }),
                      );
                      setWearingId(null);
                    },
                  },
                )
              }
              className={cn(CHIP, CHIP_OFF, "disabled:opacity-50")}
            >
              {person.name}
            </button>
          ))}
          {people.length === 0 && (
            <p className="text-[0.8125rem] text-[var(--muted-foreground)]">
              {localizeUi("ui.chat.forkcloset.nobodyToDress")}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={savingLook}
        onClose={() => setSavingLook(false)}
        title={localizeUi("ui.chat.forkcloset.saveLook")}
        width="max-w-sm"
      >
        <div className="fork-ui flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {dressed.map((person) => (
              <button
                key={person.id}
                type="button"
                aria-pressed={lookWho === person.id}
                onClick={() => {
                  setLookWho(person.id);
                  setLookName(localizeUi("ui.chat.forkcloset.lookName", { name: person.name }));
                }}
                className={cn(CHIP, lookWho === person.id ? CHIP_ON : CHIP_OFF)}
              >
                {person.name}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {wornBy(lookWho).map((pin) => (
              <img
                key={pin.id}
                src={pin.imagePath}
                alt={pin.caption}
                draggable={false}
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
            ))}
          </div>
          <input
            value={lookName}
            onChange={(event) => setLookName(event.target.value)}
            maxLength={60}
            aria-label={localizeUi("ui.chat.forkcloset.outfitName")}
            className="min-h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 text-[0.8125rem] font-semibold text-foreground outline-none"
          />
          <button
            type="button"
            disabled={!lookWho || createOutfit.isPending}
            onClick={() =>
              createOutfit.mutate(
                {
                  name: lookName.trim() || localizeUi("ui.chat.forkcloset.untitled"),
                  pinIds: wornBy(lookWho).map((pin) => pin.id),
                },
                {
                  onSuccess: () => {
                    toast.success(localizeUi("ui.chat.forkcloset.savedToCloset"));
                    setSavingLook(false);
                  },
                },
              )
            }
            className={cn(SOFT_BUTTON, "bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50")}
          >
            {createOutfit.isPending ? <Loader2 size="0.875rem" className="animate-spin" /> : <Shirt size="0.875rem" />}
            {localizeUi("ui.chat.forkcloset.saveToCloset")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
