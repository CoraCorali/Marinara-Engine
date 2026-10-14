// ──────────────────────────────────────────────
// Fork: chapters in the chat (see FORK.md)
// ──────────────────────────────────────────────
// A finished chapter folds into one row; tapping it opens its recap and messages. The Chapter pill
// in the row above the message box ends the current chapter, splits an old chat into chapters, or
// opens the last chapter again.
import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  PenLine,
  RotateCcw,
  Scissors,
  TriangleAlert,
} from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";
import { useTranslation as useUiTranslation } from "react-i18next";
import {
  chapterKeys,
  useEditForkChapter,
  useEndForkChapter,
  useForkChapters,
  useReopenForkChapter,
  useRewriteForkRecap,
  type ForkChapter,
} from "../../hooks/use-fork-chapters";
import { FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS } from "../../lib/fork/bar-pill";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui.store";
import { HelpTooltip } from "../ui/HelpTooltip";
import { Modal } from "../ui/Modal";

const SOFT_BUTTON =
  "flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_SOFT =
  "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_26%,transparent)]";
const QUIET_SOFT = "text-foreground/75 ring-1 ring-[var(--border)] hover:bg-foreground/10 hover:text-foreground";

/** The Chapter pill and its sheet. */
export function ForkChapterPill({
  chatId,
  busy,
  onPickSplit,
}: {
  chatId: string;
  /** A reply is being written, so the chapter cannot end yet. */
  busy: boolean;
  onPickSplit: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const debugMode = useUIStore((s) => s.debugMode);
  const { data } = useForkChapters(chatId);
  const ending = useIsMutating({ mutationKey: chapterKeys.ending(chatId) }) > 0;
  const end = useEndForkChapter(chatId);
  const reopen = useReopenForkChapter(chatId);
  const [open, setOpen] = useState(false);

  const current = data?.current ?? { number: 1, firstMessageId: null, messageCount: 0 };
  const lastFinished = data?.chapters[data.chapters.length - 1] ?? null;
  const long = current.messageCount >= (data?.longChapter ?? 150);
  const label = ending
    ? localizeUi("ui.chat.forkchapters.writing")
    : localizeUi("ui.chat.forkchapters.pill", { number: current.number });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS, "relative")}
        title={long ? localizeUi("ui.chat.forkchapters.longTitle") : localizeUi("ui.chat.forkchapters.pillTitle")}
        aria-label={label}
      >
        {ending ? <Loader2 size="0.875rem" className="animate-spin" /> : <BookOpen size="0.875rem" />}
        <span>{label}</span>
        {long && !ending && (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--primary)]" />
        )}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={localizeUi("ui.chat.forkchapters.title")}
        width="max-w-sm"
      >
        <div className="flex flex-col gap-3 text-[0.8125rem]">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-foreground/80">
              {localizeUi("ui.chat.forkchapters.youAreIn", { number: current.number, count: current.messageCount })}
            </p>
            <HelpTooltip
              buttonClassName="-m-2 p-2"
              text={localizeUi("ui.chat.forkchapters.help")}
              side="bottom"
              wide
              size="0.875rem"
            />
          </div>
          {long && (
            <p className="m-0 rounded-xl bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-3 py-2 text-foreground/80">
              {localizeUi("ui.chat.forkchapters.longNudge")}
            </p>
          )}
          <button
            type="button"
            className={cn(SOFT_BUTTON, PRIMARY_SOFT)}
            disabled={busy || ending || current.messageCount === 0}
            onClick={() => {
              setOpen(false);
              end.mutate({ debugMode });
            }}
          >
            {ending ? <Loader2 size="0.875rem" className="animate-spin" /> : <BookOpen size="0.875rem" />}
            {localizeUi("ui.chat.forkchapters.endHere", { number: current.number })}
          </button>
          <p className="m-0 -mt-1 text-center text-[0.75rem] text-foreground/60">
            {localizeUi("ui.chat.forkchapters.endHereHint", { next: current.number + 1 })}
          </p>
          <button
            type="button"
            className={cn(SOFT_BUTTON, QUIET_SOFT)}
            disabled={busy || ending || current.messageCount < 2}
            onClick={() => {
              setOpen(false);
              onPickSplit();
            }}
          >
            <Scissors size="0.875rem" />
            {localizeUi("ui.chat.forkchapters.split")}
          </button>
          {lastFinished && (
            <button
              type="button"
              className={cn(SOFT_BUTTON, QUIET_SOFT)}
              disabled={busy || ending || reopen.isPending}
              onClick={() => {
                if (
                  !window.confirm(localizeUi("ui.chat.forkchapters.continueConfirm", { number: lastFinished.number }))
                )
                  return;
                setOpen(false);
                reopen.mutate();
              }}
            >
              <RotateCcw size="0.875rem" />
              {localizeUi("ui.chat.forkchapters.continue", { number: lastFinished.number })}
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}

/** "## What happened" headings and "- " lines, laid out as the recap reads. */
function RecapText({ recap }: { recap: string }) {
  return (
    <div className="flex flex-col gap-1 text-[0.8125rem] leading-relaxed text-foreground/85">
      {recap.split("\n").map((line, index) => {
        const text = line.trim();
        if (!text) return null;
        if (text.startsWith("#")) {
          return (
            <div
              key={index}
              className="mt-1.5 text-[0.6875rem] font-bold tracking-wider text-[var(--primary)] uppercase first:mt-0"
            >
              {text.replace(/^#+\s*/, "")}
            </div>
          );
        }
        if (/^[-*•]\s/.test(text)) {
          return (
            <div key={index} className="flex gap-1.5 pl-1">
              <span aria-hidden="true" className="text-[var(--primary)]">
                •
              </span>
              <span>{text.replace(/^[-*•]\s+/, "")}</span>
            </div>
          );
        }
        return (
          <p key={index} className="m-0">
            {text}
          </p>
        );
      })}
    </div>
  );
}

/** A finished chapter: one row when folded, its recap when open. */
export function ForkChapterFold({
  chatId,
  chapter,
  open,
  onToggle,
  messagesLoaded,
}: {
  chatId: string;
  chapter: ForkChapter;
  open: boolean;
  onToggle: () => void;
  /** False when none of the chapter's messages are loaded yet, so opening it shows the recap only. */
  messagesLoaded: boolean;
}) {
  const { t: localizeUi } = useUiTranslation();
  const debugMode = useUIStore((s) => s.debugMode);
  const edit = useEditForkChapter(chatId);
  const rewrite = useRewriteForkRecap(chatId);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  const [recap, setRecap] = useState(chapter.recap);
  const name = chapter.title || localizeUi("ui.chat.forkchapters.untitled");
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "mx-auto my-2 w-full max-w-[min(42rem,100%)] rounded-2xl border bg-[var(--card)] px-3 py-2",
        open ? "border-[color-mix(in_srgb,var(--primary)_55%,transparent)]" : "border-[var(--border)]",
      )}
      data-fork-chapter={chapter.number}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-9 w-full items-center gap-2 text-left"
      >
        <Chevron size="0.875rem" className="shrink-0 text-[var(--primary)]" />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">
          {localizeUi("ui.chat.forkchapters.row", { number: chapter.number, title: name })}
        </span>
        {chapter.stale && (
          <TriangleAlert
            size="0.8125rem"
            className="shrink-0 text-amber-400"
            aria-label={localizeUi("ui.chat.forkchapters.staleShort")}
          />
        )}
        <span className="shrink-0 text-[0.6875rem] text-foreground/55">
          {localizeUi("ui.chat.forkchapters.messages", { count: chapter.messageCount })}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 flex flex-col gap-2 border-t border-[var(--border)] pt-2">
          {chapter.stale && !editing && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-400/10 px-2.5 py-1.5 text-[0.75rem] text-foreground/80">
              <span className="flex-1">{localizeUi("ui.chat.forkchapters.stale")}</span>
            </div>
          )}
          {editing ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-[0.6875rem] font-bold tracking-wider text-[var(--primary)] uppercase">
                {localizeUi("ui.chat.forkchapters.titleLabel")}
                <input
                  value={title}
                  maxLength={80}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-[0.8125rem] font-normal tracking-normal text-foreground normal-case"
                />
              </label>
              <label className="flex flex-col gap-1 text-[0.6875rem] font-bold tracking-wider text-[var(--primary)] uppercase">
                {localizeUi("ui.chat.forkchapters.recapLabel")}
                <textarea
                  value={recap}
                  onChange={(event) => setRecap(event.target.value)}
                  rows={12}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-[0.8125rem] font-normal tracking-normal text-foreground normal-case"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={cn(SOFT_BUTTON, QUIET_SOFT)}
                  onClick={() => {
                    setTitle(chapter.title);
                    setRecap(chapter.recap);
                    setEditing(false);
                  }}
                >
                  {localizeUi("ui.chat.forkchapters.cancel")}
                </button>
                <button
                  type="button"
                  className={cn(SOFT_BUTTON, PRIMARY_SOFT)}
                  disabled={edit.isPending || !recap.trim()}
                  onClick={() => edit.mutate({ id: chapter.id, title, recap }, { onSuccess: () => setEditing(false) })}
                >
                  {edit.isPending && <Loader2 size="0.875rem" className="animate-spin" />}
                  {localizeUi("ui.chat.forkchapters.save")}
                </button>
              </div>
            </div>
          ) : (
            <RecapText recap={chapter.recap} />
          )}
          {!editing && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {!messagesLoaded && (
                <span className="mr-auto text-[0.6875rem] text-foreground/55">
                  {localizeUi("ui.chat.forkchapters.loadMoreHint")}
                </span>
              )}
              <button
                type="button"
                className={cn(SOFT_BUTTON, QUIET_SOFT, "min-h-8 px-3 text-[0.75rem]")}
                onClick={() => {
                  setTitle(chapter.title);
                  setRecap(chapter.recap);
                  setEditing(true);
                }}
              >
                <PenLine size="0.8125rem" />
                {localizeUi("ui.chat.forkchapters.edit")}
              </button>
              <button
                type="button"
                className={cn(SOFT_BUTTON, chapter.stale ? PRIMARY_SOFT : QUIET_SOFT, "min-h-8 px-3 text-[0.75rem]")}
                disabled={rewrite.isPending}
                onClick={() => {
                  if (!window.confirm(localizeUi("ui.chat.forkchapters.rewriteConfirm"))) return;
                  rewrite.mutate({ id: chapter.id, debugMode });
                }}
              >
                {rewrite.isPending ? (
                  <Loader2 size="0.8125rem" className="animate-spin" />
                ) : (
                  <RotateCcw size="0.8125rem" />
                )}
                {localizeUi("ui.chat.forkchapters.rewrite")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Where the current chapter starts. */
export function ForkChapterMarker({ number }: { number: number }) {
  const { t: localizeUi } = useUiTranslation();
  return (
    <div
      className="my-3 flex items-center justify-center gap-2 text-[0.75rem] font-semibold tracking-[0.2em] text-[var(--primary)] uppercase"
      role="separator"
    >
      <span aria-hidden="true" className="h-px w-10 bg-[color-mix(in_srgb,var(--primary)_45%,transparent)]" />
      {localizeUi("ui.chat.forkchapters.marker", { number })}
      <span aria-hidden="true" className="h-px w-10 bg-[color-mix(in_srgb,var(--primary)_45%,transparent)]" />
    </div>
  );
}

/** Split mode: a cut between messages, and the bar that ends the mode. */
export function ForkChapterSplitButton({ onPick, disabled }: { onPick: () => void; disabled: boolean }) {
  const { t: localizeUi } = useUiTranslation();
  return (
    <div className="my-1 flex justify-center">
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={cn(
          SOFT_BUTTON,
          PRIMARY_SOFT,
          "min-h-8 border border-dashed border-[var(--primary)] px-3 text-[0.75rem]",
        )}
      >
        <Scissors size="0.8125rem" />
        {localizeUi("ui.chat.forkchapters.endAtMessage")}
      </button>
    </div>
  );
}

export function ForkChapterSplitBar({ onDone }: { onDone: () => void }) {
  const { t: localizeUi } = useUiTranslation();
  return (
    <div className="sticky top-0 z-20 mx-auto mb-2 flex w-full max-w-[min(42rem,100%)] items-center gap-2 rounded-2xl border border-[var(--primary)] bg-[var(--card)] px-3 py-2 text-[0.75rem] shadow-lg">
      <Scissors size="0.875rem" className="shrink-0 text-[var(--primary)]" />
      <span className="flex-1 text-foreground/85">{localizeUi("ui.chat.forkchapters.splitBar")}</span>
      <button type="button" onClick={onDone} className={cn(SOFT_BUTTON, PRIMARY_SOFT, "min-h-8 px-3 text-[0.75rem]")}>
        {localizeUi("ui.chat.forkchapters.done")}
      </button>
    </div>
  );
}
