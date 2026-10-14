// ──────────────────────────────────────────────
// Fork: the relationship tracker — Pura-style dating-sim cards, shaped by what kind of bond it is
// ──────────────────────────────────────────────
import { useEffect, useId, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, Loader2, Plus, Trash2, Wand2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation as useUiTranslation } from "react-i18next";
import {
  FORK_BOND_CONDITIONS,
  FORK_BOND_DRIFTS,
  FORK_BOND_KINDS,
  FORK_BOND_SHAPES,
  FORK_LOVE_STATUSES,
  forkBondNeighbours,
  type ForkBondKind,
  type ForkLoveStatus,
} from "@marinara-engine/shared";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { cn } from "../../lib/utils";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import { useAgentConfigs, useCreateAgent, useUpdateAgent } from "../../hooks/use-agents";
import { useChat, useUpdateChatMetadata } from "../../hooks/use-chats";
import {
  BONDS_AGENT_PROMPT,
  bondsAgentPayload,
  findBondsAgent,
  hasLegacyBondsPrompt,
} from "../../lib/fork/bonds-agent";
import {
  useAddBond,
  useBondMoments,
  useBonds,
  useDeleteBond,
  useDeleteMoment,
  useUpdateBond,
  useUpdateMoment,
  type Bond,
  type BondMoment,
  type BondPatch,
} from "../../hooks/use-fork-bonds";

const KIND_LABEL_KEYS: Record<ForkBondKind, string> = {
  love: "ui.chat.forkbonds.kindLove",
  family: "ui.chat.forkbonds.kindFamily",
  friend: "ui.chat.forkbonds.kindFriend",
  rival: "ui.chat.forkbonds.kindRival",
  ex: "ui.chat.forkbonds.kindEx",
  other: "ui.chat.forkbonds.kindOther",
};

const KIND_EMOJI: Record<ForkBondKind, string> = {
  love: "💞",
  family: "🏠",
  friend: "🫂",
  rival: "⚔️",
  ex: "🥀",
  other: "✨",
};

const STATUS_LABEL_KEYS: Record<ForkLoveStatus, string> = {
  talking: "ui.chat.forkbonds.stageTalking",
  dating: "ui.chat.forkbonds.stageDating",
  together: "ui.chat.forkbonds.stageTogether",
  living: "ui.chat.forkbonds.stageLiving",
  engaged: "ui.chat.forkbonds.stageEngaged",
  married: "ui.chat.forkbonds.stageMarried",
};

/** Each field's little glyph, as on Pura's cards. */
const FIELD_EMOJI: Record<string, string> = {
  heart: "❤",
  trust: "◆",
  want: "✦",
  guard: "⛨",
  likes: "🎁",
  dislikes: "✖",
  tell: "👁",
  unsaid: "🤐",
  memory: "📷",
  date: "💌",
  turn: "⚡",
  next: "🔓",
  role: "🏷",
  wound: "🩹",
  expects: "📋",
  protects: "🛡",
  vibe: "🎶",
  joke: "😂",
  owed: "🤝",
  hangout: "☕",
  respect: "🎖",
  grudge: "💢",
  beat: "🏆",
  weakness: "🎯",
  ended: "🥀",
  pull: "🧲",
  hurts: "💔",
};

/**
 * The mini cards are tinted from the theme's accent turned round the colour wheel, so they stay
 * colour-coded like Pura's and still belong to whatever theme is on. Browsers without relative
 * colour syntax keep the plain accent tint.
 */
const TINT_STYLES = `
.fork-bond-tint { background: color-mix(in srgb, var(--primary) 12%, transparent); border-color: color-mix(in srgb, var(--primary) 26%, transparent); }
.fork-bond-tint[data-hue="1"] { background: oklch(from var(--primary) l c calc(h + 150) / 0.13); border-color: oklch(from var(--primary) l c calc(h + 150) / 0.3); }
.fork-bond-tint[data-hue="2"] { background: oklch(from var(--primary) l c calc(h + 60) / 0.13); border-color: oklch(from var(--primary) l c calc(h + 60) / 0.3); }
.fork-bond-tint[data-hue="3"] { background: oklch(from var(--primary) l c calc(h + 250) / 0.13); border-color: oklch(from var(--primary) l c calc(h + 250) / 0.3); }
.fork-bond-ring { background: conic-gradient(from 210deg, var(--primary), oklch(from var(--primary) l c calc(h + 60)), oklch(from var(--primary) l c calc(h + 150)), oklch(from var(--primary) l c calc(h + 250)), var(--primary)); }
`;

/** A field that saves a moment after you stop, instead of once per keystroke. */
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

/** The dropdown value for a bond with somebody who is not a card in this chat. */
const OUTSIDER = "__outsider__";

interface CastMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface Props {
  chatId: string | null;
  cast: CastMember[];
}

const SELECT_CLASS =
  "min-h-11 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-2.5 text-xs font-semibold text-foreground outline-none";

function Portrait({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "fork-bond-ring relative block shrink-0 rounded-full shadow-[0_0_14px_color-mix(in_srgb,var(--primary)_35%,transparent)]",
        size === "lg" ? "h-16 w-16 p-[3px]" : "h-11 w-11 p-[2px]",
      )}
    >
      <span
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[var(--card)] font-serif font-bold text-[var(--primary)]",
          size === "lg" ? "text-2xl" : "text-base",
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover object-[center_18%]" draggable={false} />
        ) : (
          name.trim().charAt(0).toUpperCase() || "?"
        )}
      </span>
    </span>
  );
}

function FieldBox({
  field,
  value,
  hue,
  mini,
  onCommit,
}: {
  field: string;
  value: string;
  hue: number;
  mini: boolean;
  onCommit: (next: string) => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const label = localizeUi(`ui.chat.forkbonds.field.${field}`);
  const id = useId();
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border px-2.5 py-2",
        mini ? "fork-bond-tint" : "border-transparent border-l-[3px] border-l-[var(--primary)] bg-foreground/[0.04]",
      )}
      data-hue={mini ? hue : undefined}
    >
      <label htmlFor={id} className="text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">
        <span aria-hidden="true">{FIELD_EMOJI[field] ?? "•"} </span>
        {label}
      </label>
      <DraftTextarea
        id={id}
        value={value}
        onCommit={onCommit}
        rows={mini ? 3 : 2}
        placeholder={localizeUi("ui.chat.forkbonds.fieldEmpty")}
        className="min-h-[2.5rem] w-full resize-none bg-transparent text-[0.8125rem] leading-snug text-foreground outline-none [field-sizing:content] placeholder:italic placeholder:text-[var(--muted-foreground)]"
      />
    </div>
  );
}

function MomentRow({
  moment,
  onSave,
  onDelete,
}: {
  moment: BondMoment;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const when = new Date(moment.createdAt);
  return (
    <li className="relative flex flex-col gap-1 border-l-2 border-[color-mix(in_srgb,var(--primary)_45%,transparent)] pb-1 pl-3">
      <span
        aria-hidden="true"
        className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]"
      />
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] px-2 py-0.5 font-semibold text-foreground">
          {moment.from || "—"} → {moment.to}
        </span>
        {!Number.isNaN(when.getTime()) && (
          <span className="text-[var(--muted-foreground)]">{when.toLocaleDateString()}</span>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={localizeUi("ui.chat.forkbonds.removeMoment")}
          title={localizeUi("ui.chat.forkbonds.removeMoment")}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-foreground/10"
        >
          <X size="0.75rem" />
        </button>
      </div>
      <DraftTextarea
        value={moment.text}
        onCommit={onSave}
        rows={2}
        placeholder={localizeUi("ui.chat.forkbonds.momentPlaceholder")}
        aria-label={localizeUi("ui.chat.forkbonds.momentCaption")}
        className="w-full resize-none bg-transparent text-[0.8125rem] italic leading-snug text-foreground outline-none [field-sizing:content] placeholder:text-[var(--muted-foreground)]"
      />
    </li>
  );
}

function BondCard({
  bond,
  name,
  avatarUrl,
  moments,
  chatId,
}: {
  bond: Bond;
  name: string;
  avatarUrl?: string | null;
  moments: BondMoment[];
  chatId: string | null;
}) {
  const { t: localizeUi } = useUiTranslation();
  const updateBond = useUpdateBond(chatId);
  const deleteBond = useDeleteBond(chatId);
  const updateMoment = useUpdateMoment(chatId);
  const deleteMoment = useDeleteMoment(chatId);
  const [open, setOpen] = useState(false);
  const shape = FORK_BOND_SHAPES[bond.kind];
  const { below, above } = forkBondNeighbours(bond.kind, bond.rung);
  const patch = (data: BondPatch) => updateBond.mutate({ id: bond.id, ...data });
  const saveField = (field: string) => (value: string) => patch({ fields: { [field]: value } });
  const miniFields = shape.fields.slice(0, 4);
  const restFields = shape.fields.slice(4);
  const summary = [bond.rung, bond.condition].filter(Boolean).join(" · ");

  return (
    <article className="shrink-0 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[var(--card)] shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,var(--card)),color-mix(in_srgb,var(--primary)_32%,var(--card)))] px-3 py-2 text-left"
      >
        <Portrait name={name} avatarUrl={avatarUrl} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-bold text-foreground">
            <span aria-hidden="true">{KIND_EMOJI[bond.kind]} </span>
            {name || localizeUi("ui.chat.forkbonds.whoIsIt")}
          </span>
          <span className="truncate text-xs text-[var(--primary)]">
            {[bond.status ? localizeUi(STATUS_LABEL_KEYS[bond.status]) : "", summary].filter(Boolean).join(" · ")}
          </span>
        </span>
        {bond.drift && (
          <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-1 text-[0.6875rem] font-semibold text-foreground/85">
            {bond.drift}
          </span>
        )}
        <ChevronDown
          size="1rem"
          className={cn("shrink-0 text-[var(--muted-foreground)] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 p-3">
          {bond.kind === "love" && (
            <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--primary)_26%,transparent),transparent)] px-3 py-1.5">
              <span className="shrink-0 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                {localizeUi("ui.chat.forkbonds.route")}
              </span>
              <DraftInput
                value={bond.route}
                onCommit={(route) => patch({ route })}
                placeholder={localizeUi("ui.chat.forkbonds.routePlaceholder")}
                aria-label={localizeUi("ui.chat.forkbonds.route")}
                className="min-h-9 min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none placeholder:font-normal placeholder:text-[var(--muted-foreground)]"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <Portrait name={name} avatarUrl={avatarUrl} size="lg" />
            <DraftInput
              value={name}
              onCommit={(label) => patch({ label })}
              aria-label={localizeUi("ui.chat.forkbonds.whoThisIs")}
              placeholder={localizeUi("ui.chat.forkbonds.whoIsIt")}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-lg font-extrabold text-foreground outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="sr-only" htmlFor={`bond-kind-${bond.id}`}>
              {localizeUi("ui.chat.forkbonds.whatKindOfBond")}
            </label>
            <select
              id={`bond-kind-${bond.id}`}
              value={bond.kind}
              onChange={(event) => patch({ kind: event.target.value as ForkBondKind })}
              className={SELECT_CLASS}
            >
              {FORK_BOND_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_EMOJI[kind]} {localizeUi(KIND_LABEL_KEYS[kind])}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`bond-condition-${bond.id}`}>
              {localizeUi("ui.chat.forkbonds.condition")}
            </label>
            <select
              id={`bond-condition-${bond.id}`}
              value={bond.condition}
              onChange={(event) => patch({ condition: event.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">{localizeUi("ui.chat.forkbonds.condition")}</option>
              {FORK_BOND_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {condition}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`bond-drift-${bond.id}`}>
              {localizeUi("ui.chat.forkbonds.drift")}
            </label>
            <select
              id={`bond-drift-${bond.id}`}
              value={bond.drift}
              onChange={(event) => patch({ drift: event.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">{localizeUi("ui.chat.forkbonds.drift")}</option>
              {FORK_BOND_DRIFTS.map((drift) => (
                <option key={drift} value={drift}>
                  {drift}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`bond-rung-${bond.id}`}>
              {localizeUi("ui.chat.forkbonds.rung")}
            </label>
            <select
              id={`bond-rung-${bond.id}`}
              value={bond.rung}
              onChange={(event) => patch({ rung: event.target.value })}
              className={SELECT_CLASS}
            >
              {shape.ladders.map((ladder, index) => (
                <optgroup
                  key={index}
                  label={localizeUi(index === 0 ? "ui.chat.forkbonds.ladderWarm" : "ui.chat.forkbonds.ladderCold")}
                >
                  {ladder.map((rung) => (
                    <option key={rung} value={rung}>
                      {rung}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label={localizeUi("ui.chat.forkbonds.ladderTangled")}>
                {shape.tangled.map((rung) => (
                  <option key={rung} value={rung}>
                    {rung}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {bond.kind === "love" && (
            <div>
              <div className="mb-1 text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                {localizeUi("ui.chat.forkbonds.status")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FORK_LOVE_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => patch({ status })}
                    aria-pressed={bond.status === status}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors",
                      bond.status === status
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] text-foreground/80 hover:bg-foreground/10",
                    )}
                  >
                    {localizeUi(STATUS_LABEL_KEYS[status])}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
              {localizeUi("ui.chat.forkbonds.progress")}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="min-w-0 flex-1 truncate rounded-full bg-foreground/[0.06] px-2.5 py-1.5 text-center text-[var(--muted-foreground)]">
                {below ?? "—"}
              </span>
              <span aria-hidden="true" className="h-px w-3 bg-[var(--primary)]" />
              <span className="min-w-0 flex-[1.3] truncate rounded-full bg-[var(--primary)] px-2.5 py-1.5 text-center text-[var(--primary-foreground)] shadow-[0_0_12px_color-mix(in_srgb,var(--primary)_45%,transparent)]">
                ♥ {bond.rung}
              </span>
              <span aria-hidden="true" className="h-px w-3 bg-[var(--primary)]" />
              <span className="min-w-0 flex-1 truncate rounded-full border border-dashed border-[color-mix(in_srgb,var(--primary)_50%,transparent)] px-2.5 py-1.5 text-center text-[var(--muted-foreground)]">
                🔒 {above ?? "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            {miniFields.map((field, index) => (
              <FieldBox
                key={field}
                field={field}
                value={bond.fields[field] ?? ""}
                hue={index}
                mini
                onCommit={saveField(field)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {restFields.map((field) => (
              <FieldBox
                key={field}
                field={field}
                value={bond.fields[field] ?? ""}
                hue={0}
                mini={false}
                onCommit={saveField(field)}
              />
            ))}
          </div>

          <section aria-label={localizeUi("ui.chat.forkbonds.moments")}>
            <div className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--primary)]">
              💫 {localizeUi("ui.chat.forkbonds.moments")}
            </div>
            {moments.length === 0 ? (
              <p className="text-xs italic text-[var(--muted-foreground)]">
                {localizeUi("ui.chat.forkbonds.noMoments")}
              </p>
            ) : (
              <ol className="flex flex-col gap-2 pl-1">
                {[...moments].reverse().map((moment) => (
                  <MomentRow
                    key={moment.id}
                    moment={moment}
                    onSave={(text) => updateMoment.mutate({ id: moment.id, text })}
                    onDelete={() => deleteMoment.mutate(moment.id)}
                  />
                ))}
              </ol>
            )}
          </section>

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
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[var(--muted-foreground)] hover:bg-foreground/10"
          >
            <Trash2 size="0.875rem" />
            {localizeUi("ui.chat.forkbonds.stopTrackingValue1", {
              value1: name || localizeUi("ui.chat.forkbonds.whoIsIt"),
            })}
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * One card per bond. A love interest gets Pura's whole dating-sim route; every other kind gets its
 * own ladder and fields in the same card, so a sister is never asked what date she would say yes to.
 */
export function ForkBondsPanel({ chatId, cast }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const { data: bonds, isLoading } = useBonds(chatId);
  const { data: moments } = useBondMoments(chatId);
  const addBond = useAddBond(chatId);
  const { data: chat } = useChat(chatId);
  const { data: agentConfigs } = useAgentConfigs(Boolean(chatId));
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const updateMeta = useUpdateChatMetadata({ serialize: true });
  const [adding, setAdding] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Whether an agent already keeps this chat's tracker up to date.
  const bondsAgent = findBondsAgent(agentConfigs);

  // An agent the first version made still asks for two numbers and a note. It is the fork's own
  // agent, made by one tap, so it is moved onto the new prompt rather than left behind.
  const legacyAgentId = hasLegacyBondsPrompt(bondsAgent as { promptTemplate?: unknown } | null)
    ? (bondsAgent as { id?: string } | null)?.id
    : undefined;
  useEffect(() => {
    if (legacyAgentId) updateAgent.mutate({ id: legacyAgentId, promptTemplate: BONDS_AGENT_PROMPT });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per legacy agent
  }, [legacyAgentId]);

  const chatMeta = (() => {
    const raw = chat?.metadata;
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
    try {
      return typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  const activeAgentIds = Array.isArray(chatMeta.activeAgentIds)
    ? chatMeta.activeAgentIds.filter((id): id is string => typeof id === "string")
    : [];
  const autoUpdating =
    Boolean(bondsAgent) && chatMeta.enableAgents === true && activeAgentIds.includes(bondsAgent!.type);

  // One tap: make the agent if there is none yet, then switch it on for this chat.
  const handleAutoUpdate = async () => {
    if (!chatId || connecting) return;
    setConnecting(true);
    try {
      const agent =
        bondsAgent ?? (await createAgent.mutateAsync(bondsAgentPayload(localizeUi("ui.chat.forkbonds.agentName"))));
      if (!agent?.type) throw new Error("no agent");
      await updateMeta.mutateAsync({
        id: chatId,
        enableAgents: true,
        activeAgentIds: Array.from(new Set([...activeAgentIds, agent.type])),
      });
      toast.success(localizeUi("ui.chat.forkbonds.autoUpdateOn"));
    } catch {
      toast.error(localizeUi("ui.chat.forkbonds.autoUpdateFailed"));
    } finally {
      setConnecting(false);
    }
  };

  const tracked = new Set((bonds ?? []).map((bond) => bond.characterId));
  const untracked = cast.filter((member) => !tracked.has(member.id));
  const memberFor = (bond: Bond) => cast.find((member) => member.id === bond.characterId);

  return (
    <div className="flex max-h-[75vh] min-h-[20rem] flex-col gap-3">
      <style>{TINT_STYLES}</style>
      <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkbonds.intro")}</p>
      {autoUpdating ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
          <Check size="0.75rem" />
          {localizeUi("ui.chat.forkbonds.autoUpdating")}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void handleAutoUpdate()}
          disabled={!chatId || connecting}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--primary)] px-3 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
        >
          {connecting ? <Loader2 size="0.875rem" className="animate-spin" /> : <Wand2 size="0.875rem" />}
          {localizeUi("ui.chat.forkbonds.autoUpdate")}
        </button>
      )}

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
          const member = memberFor(bond);
          return (
            <BondCard
              key={bond.id}
              bond={bond}
              name={bond.label.trim() || member?.name || ""}
              avatarUrl={member?.avatarUrl}
              moments={(moments ?? []).filter((moment) => moment.bondId === bond.id)}
              chatId={chatId}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="fork-bonds-add">
          {localizeUi("ui.chat.forkbonds.trackSomeone")}
        </label>
        <select
          id="fork-bonds-add"
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          className="min-h-11 flex-1 rounded-xl bg-[var(--secondary)] px-3 text-sm text-foreground outline-none"
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
          aria-label={localizeUi("ui.chat.forkbonds.trackSomeone")}
        >
          {addBond.isPending ? <Loader2 size="0.875rem" className="animate-spin" /> : <Plus size="0.875rem" />}
        </button>
      </div>
    </div>
  );
}
