// ──────────────────────────────────────────────
// Fork: "Between them" — how two characters stand with each other (see FORK.md)
// ──────────────────────────────────────────────
import { useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { FORK_BOND_KINDS, FORK_BOND_SHAPES, type ForkBondKind } from "@marinara-engine/shared";
import { HelpTooltip } from "../ui/HelpTooltip";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import {
  useAddBondPair,
  useBondPairs,
  useDeleteBondPair,
  useUpdateBondPair,
  type BondPair,
} from "../../hooks/use-fork-bonds";
import { showConfirmDialog } from "../../lib/app-dialogs";

type CastMember = { id: string; name: string; avatarUrl?: string | null };

const KIND_EMOJI: Record<ForkBondKind, string> = {
  love: "💞",
  family: "🏠",
  friend: "🫂",
  rival: "⚔️",
  ex: "💔",
  other: "🌀",
};

const KIND_LABEL_KEYS: Record<ForkBondKind, string> = {
  love: "ui.chat.forkbonds.kindLove",
  family: "ui.chat.forkbonds.kindFamily",
  friend: "ui.chat.forkbonds.kindFriend",
  rival: "ui.chat.forkbonds.kindRival",
  ex: "ui.chat.forkbonds.kindEx",
  other: "ui.chat.forkbonds.kindOther",
};

const SELECT_CLASS =
  "min-h-8 min-w-0 rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2.5 text-xs font-semibold text-foreground outline-none";

function Face({ member }: { member: CastMember | undefined }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--secondary)] text-[0.6875rem] font-extrabold text-[var(--primary)] ring-[1.5px] ring-[var(--primary)]">
      {member?.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        (member?.name.trim().charAt(0) ?? "?")
      )}
    </span>
  );
}

/** One side's line: how this person is with the other. Saves a moment after you stop typing. */
function SideLine({
  member,
  value,
  onCommit,
}: {
  member: CastMember | undefined;
  value: string;
  onCommit: (value: string) => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const [draft, change, flush] = useForkDraftField(value, onCommit);
  return (
    <label className="flex items-start gap-2 rounded-xl bg-[var(--secondary)] px-2 py-1.5">
      <Face member={member} />
      <textarea
        rows={1}
        value={draft}
        onChange={(event) => change(event.target.value)}
        onBlur={flush}
        placeholder={localizeUi("ui.chat.forkbonds.pairSidePlaceholder", { name: member?.name ?? "" })}
        aria-label={localizeUi("ui.chat.forkbonds.pairSideLabel", { name: member?.name ?? "" })}
        className="min-h-7 w-full resize-none bg-transparent py-1 text-xs leading-snug text-foreground outline-none [field-sizing:content] placeholder:text-[var(--muted-foreground)]"
      />
    </label>
  );
}

function PairCard({ pair, cast, chatId }: { pair: BondPair; cast: readonly CastMember[]; chatId: string | null }) {
  const { t: localizeUi } = useUiTranslation();
  const updatePair = useUpdateBondPair(chatId);
  const deletePair = useDeleteBondPair(chatId);
  const a = cast.find((member) => member.id === pair.aId);
  const b = cast.find((member) => member.id === pair.bId);
  const shape = FORK_BOND_SHAPES[pair.kind];
  const rungs = [...shape.ladders.flat(), ...shape.tangled];
  return (
    <article className="flex flex-col gap-1.5 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--card)] p-2.5">
      <div className="flex items-center gap-1.5">
        <Face member={a} />
        <ArrowLeftRight size="0.75rem" className="shrink-0 text-[var(--muted-foreground)]" />
        <Face member={b} />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold text-foreground">
          {localizeUi("ui.chat.forkbonds.pairNames", { a: a?.name ?? "?", b: b?.name ?? "?" })}
        </span>
        <button
          type="button"
          onClick={async () => {
            const ok = await showConfirmDialog({
              title: localizeUi("ui.chat.forkbonds.pairRemove"),
              message: localizeUi("ui.chat.forkbonds.pairRemoveBody"),
              confirmLabel: localizeUi("ui.chat.forkbonds.pairRemoveConfirm"),
              chatStyle: true,
            });
            if (ok) deletePair.mutate(pair.id);
          }}
          aria-label={localizeUi("ui.chat.forkbonds.pairRemove")}
          title={localizeUi("ui.chat.forkbonds.pairRemove")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-foreground/10"
        >
          <Trash2 size="0.75rem" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={pair.kind}
          onChange={(event) => updatePair.mutate({ id: pair.id, kind: event.target.value as ForkBondKind })}
          aria-label={localizeUi("ui.chat.forkbonds.whatKindOfBond")}
          className={SELECT_CLASS}
        >
          {FORK_BOND_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {localizeUi("ui.chat.scheduletimeline.value1Value2", {
                value1: KIND_EMOJI[kind],
                value2: localizeUi(KIND_LABEL_KEYS[kind]),
              })}
            </option>
          ))}
        </select>
        <select
          value={pair.rung}
          onChange={(event) => updatePair.mutate({ id: pair.id, rung: event.target.value })}
          aria-label={localizeUi("ui.chat.forkbonds.pairRung")}
          className={SELECT_CLASS}
        >
          {rungs.map((rung) => (
            <option key={rung} value={rung}>
              {rung}
            </option>
          ))}
        </select>
      </div>
      <SideLine member={a} value={pair.aLine} onCommit={(aLine) => updatePair.mutate({ id: pair.id, aLine })} />
      <SideLine member={b} value={pair.bLine} onCommit={(bLine) => updatePair.mutate({ id: pair.id, bLine })} />
    </article>
  );
}

/** The pairs section of the People panel. Needs two characters in the chat to mean anything. */
export function ForkBondPairs({ chatId, cast }: { chatId: string | null; cast: readonly CastMember[] }) {
  const { t: localizeUi } = useUiTranslation();
  const { data: pairs } = useBondPairs(chatId);
  const addPair = useAddBondPair(chatId);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  if (cast.length < 2) return null;
  const canAdd = first && second && first !== second && !addPair.isPending;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">
        {localizeUi("ui.chat.forkbonds.betweenThem")}
        <HelpTooltip buttonClassName="-m-2 p-2" text={localizeUi("ui.chat.forkbonds.betweenThemHelp")} wide />
      </h3>
      {(pairs ?? []).map((pair) => (
        <PairCard key={pair.id} pair={pair} cast={cast} chatId={chatId} />
      ))}
      <div className="flex items-center gap-1.5">
        {[
          [first, setFirst],
          [second, setSecond],
        ].map(([value, set], index) => (
          <select
            key={index}
            value={value as string}
            onChange={(event) => (set as (next: string) => void)(event.target.value)}
            aria-label={localizeUi("ui.chat.forkbonds.pairPick")}
            className={`${SELECT_CLASS} flex-1`}
          >
            <option value="">{localizeUi("ui.chat.forkbonds.pairPick")}</option>
            {cast.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        ))}
        <button
          type="button"
          disabled={!canAdd}
          onClick={() =>
            addPair.mutate(
              { firstId: first, secondId: second },
              {
                onSuccess: () => {
                  setFirst("");
                  setSecond("");
                },
              },
            )
          }
          aria-label={localizeUi("ui.chat.forkbonds.pairAdd")}
          title={localizeUi("ui.chat.forkbonds.pairAdd")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-40"
        >
          <Plus size="0.875rem" />
        </button>
      </div>
    </section>
  );
}
