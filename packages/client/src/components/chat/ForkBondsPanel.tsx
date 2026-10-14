// ──────────────────────────────────────────────
// Fork: the relationship tracker — one card per bond, shaped by what kind it is
// ──────────────────────────────────────────────
import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import {
  BOND_KINDS,
  BOND_METERS,
  LOVE_STAGES,
  useAddBond,
  useBonds,
  useDeleteBond,
  useUpdateBond,
  type Bond,
  type BondKind,
  type LoveStage,
} from "../../hooks/use-fork-bonds";

const KIND_LABEL_KEYS: Record<BondKind, string> = {
  love: "ui.chat.forkbonds.kindLove",
  family: "ui.chat.forkbonds.kindFamily",
  friend: "ui.chat.forkbonds.kindFriend",
  rival: "ui.chat.forkbonds.kindRival",
  ex: "ui.chat.forkbonds.kindEx",
  other: "ui.chat.forkbonds.kindOther",
};

const STAGE_LABEL_KEYS: Record<LoveStage, string> = {
  talking: "ui.chat.forkbonds.stageTalking",
  dating: "ui.chat.forkbonds.stageDating",
  together: "ui.chat.forkbonds.stageTogether",
  living: "ui.chat.forkbonds.stageLiving",
  engaged: "ui.chat.forkbonds.stageEngaged",
  married: "ui.chat.forkbonds.stageMarried",
};

const METER_LABEL_KEYS: Record<string, string> = {
  wanting: "ui.chat.forkbonds.meterWanting",
  patience: "ui.chat.forkbonds.meterPatience",
  closeness: "ui.chat.forkbonds.meterCloseness",
  friction: "ui.chat.forkbonds.meterFriction",
  trust: "ui.chat.forkbonds.meterTrust",
  respect: "ui.chat.forkbonds.meterRespect",
  hostility: "ui.chat.forkbonds.meterHostility",
  unfinished: "ui.chat.forkbonds.meterUnfinished",
  bitterness: "ui.chat.forkbonds.meterBitterness",
};

/** A field that saves a moment after you stop, instead of once per keystroke. */
function DraftInput({
  value,
  onCommit,
  className,
  ...rest
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const [draft, change, flush] = useForkDraftField(value, onCommit);
  return (
    <input
      {...rest}
      value={draft}
      onChange={(event) => change(event.target.value)}
      onBlur={flush}
      className={className}
    />
  );
}

/** The same, for the "where it stands" note. */
function DraftTextarea({
  value,
  onCommit,
  className,
  ...rest
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">) {
  const [draft, change, flush] = useForkDraftField(value, onCommit);
  return (
    <textarea
      {...rest}
      value={draft}
      onChange={(event) => change(event.target.value)}
      onBlur={flush}
      className={className}
    />
  );
}

/** A slider that saves where it was let go, not every pixel on the way. */
function DraftRange({
  value,
  onCommit,
  ...rest
}: {
  value: number;
  onCommit: (next: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [draft, change, flush] = useForkDraftField(value, onCommit, 350);
  return (
    <input
      {...rest}
      type="range"
      value={draft}
      onChange={(event) => change(Number(event.target.value))}
      onPointerUp={flush}
      onKeyUp={flush}
    />
  );
}

/** The dropdown value for a bond with somebody who is not a card in this chat. */
const OUTSIDER = "__outsider__";

interface CastMember {
  id: string;
  name: string;
}

interface Props {
  chatId: string | null;
  cast: CastMember[];
}

/**
 * One card per bond. The card's shape follows its kind: a romance gets the ladder from talking
 * through married, and every kind names its own two meters, so a sister is never scored on
 * "wanting" and a friend is never scored like a love interest.
 */
export function ForkBondsPanel({ chatId, cast }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const { data: bonds, isLoading } = useBonds(chatId);
  const addBond = useAddBond(chatId);
  const updateBond = useUpdateBond(chatId);
  const deleteBond = useDeleteBond(chatId);
  const [adding, setAdding] = useState("");

  const tracked = new Set((bonds ?? []).map((bond) => bond.characterId));
  const untracked = cast.filter((member) => !tracked.has(member.id));

  const nameFor = (bond: Bond) =>
    bond.label.trim() || cast.find((member) => member.id === bond.characterId)?.name || "";

  return (
    <div className="flex max-h-[70vh] min-h-[20rem] flex-col gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkbonds.intro")}</p>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 size="1.25rem" className="animate-spin text-[var(--muted-foreground)]" />
          </div>
        )}

        {!isLoading && (bonds ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            {localizeUi("ui.chat.forkbonds.emptyHint")}
          </p>
        )}

        {(bonds ?? []).map((bond) => {
          const [firstMeter, secondMeter] = BOND_METERS[bond.kind];
          return (
            <div key={bond.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
              <div className="flex items-center gap-2">
                <DraftInput
                  value={nameFor(bond)}
                  onCommit={(label) => updateBond.mutate({ id: bond.id, label })}
                  aria-label={localizeUi("ui.chat.forkbonds.whoThisIs")}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"
                />
                <label className="sr-only" htmlFor={`bond-kind-${bond.id}`}>
                  {localizeUi("ui.chat.forkbonds.whatKindOfBond")}
                </label>
                <select
                  id={`bond-kind-${bond.id}`}
                  value={bond.kind}
                  onChange={(event) => updateBond.mutate({ id: bond.id, kind: event.target.value as BondKind })}
                  className="min-h-9 rounded-lg bg-[var(--secondary)] px-2 text-xs font-semibold text-foreground outline-none"
                >
                  {BOND_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {localizeUi(KIND_LABEL_KEYS[kind])}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await showConfirmDialog({
                      title: localizeUi("ui.chat.forkbonds.stopTracking"),
                      message: localizeUi("ui.chat.forkbonds.stopTrackingBody"),
                      confirmLabel: localizeUi("ui.chat.forkbonds.stopTrackingConfirm"),
                    });
                    if (ok) deleteBond.mutate(bond.id);
                  }}
                  aria-label={localizeUi("ui.chat.forkbonds.stopTrackingValue1", { value1: nameFor(bond) })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)]"
                >
                  <Trash2 size="0.875rem" />
                </button>
              </div>

              {bond.kind === "love" && (
                <div className="mt-3">
                  <div className="flex gap-1">
                    {LOVE_STAGES.map((stage) => {
                      const reached = LOVE_STAGES.indexOf(stage) <= LOVE_STAGES.indexOf(bond.stage ?? "talking");
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => updateBond.mutate({ id: bond.id, stage })}
                          aria-pressed={bond.stage === stage}
                          aria-label={localizeUi(STAGE_LABEL_KEYS[stage])}
                          title={localizeUi(STAGE_LABEL_KEYS[stage])}
                          // The bar is thin, the button around it is a full tap target.
                          className="flex h-11 flex-1 items-center"
                        >
                          <span
                            className={
                              "h-2 w-full rounded-full " + (reached ? "bg-[var(--primary)]" : "bg-[var(--muted)]")
                            }
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--primary)]">
                    {localizeUi(STAGE_LABEL_KEYS[bond.stage ?? "talking"])}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2">
                {(
                  [
                    [firstMeter, bond.first, "first"],
                    [secondMeter, bond.second, "second"],
                  ] as const
                ).map(([meter, value, field]) => (
                  <div key={field}>
                    <label
                      htmlFor={`bond-${field}-${bond.id}`}
                      className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]"
                    >
                      {localizeUi(METER_LABEL_KEYS[meter] ?? "ui.chat.forkbonds.meterCloseness")}
                    </label>
                    <DraftRange
                      id={`bond-${field}-${bond.id}`}
                      min={0}
                      max={100}
                      value={value}
                      onCommit={(next) => updateBond.mutate({ id: bond.id, [field]: next } as never)}
                      className="w-full accent-[var(--primary)]"
                    />
                  </div>
                ))}
              </div>

              <DraftTextarea
                value={bond.note}
                onCommit={(note) => updateBond.mutate({ id: bond.id, note })}
                placeholder={localizeUi("ui.chat.forkbonds.whereItStands")}
                aria-label={localizeUi("ui.chat.forkbonds.whereItStands")}
                rows={2}
                className="mt-2 w-full resize-none rounded-lg bg-[var(--secondary)] px-2.5 py-2 text-xs text-foreground outline-none"
              />
            </div>
          );
        })}
      </div>

      {
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="fork-bonds-add">
            {localizeUi("ui.chat.forkbonds.trackSomeone")}
          </label>
          <select
            id="fork-bonds-add"
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            className="min-h-11 flex-1 rounded-lg bg-[var(--secondary)] px-3 text-sm text-foreground outline-none"
          >
            <option value="">{localizeUi("ui.chat.forkbonds.trackSomeone")}</option>
            {untracked.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
            {/* Not everyone who matters is a card in this chat. */}
            <option value={OUTSIDER}>{localizeUi("ui.chat.forkbonds.someoneElse")}</option>
          </select>
          <button
            type="button"
            onClick={() => {
              if (!adding) return;
              if (adding === OUTSIDER) {
                // Its own id, so it never collides with a card that appears later.
                addBond.mutate({ characterId: `outsider-${Date.now()}`, label: "", kind: "other" });
              } else {
                const member = untracked.find((entry) => entry.id === adding);
                addBond.mutate({ characterId: adding, label: member?.name ?? "", kind: "other" });
              }
              setAdding("");
            }}
            disabled={!adding || addBond.isPending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
            aria-label={localizeUi("ui.chat.forkbonds.trackSomeone")}
          >
            {addBond.isPending ? <Loader2 size="0.875rem" className="animate-spin" /> : <Plus size="0.875rem" />}
          </button>
        </div>
      }
    </div>
  );
}
