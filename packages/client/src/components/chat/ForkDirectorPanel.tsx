// ──────────────────────────────────────────────
// Fork: the Director's chair — talk out the next reply off the record
// ──────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, RotateCcw, SendHorizontal } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api-client";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { useUIStore } from "../../stores/ui.store";

export interface DirectorTurn {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  chatId: string;
  /** Kept by the chat so the conversation survives closing and reopening the panel. */
  turns: DirectorTurn[];
  note: string;
  onChange: (turns: DirectorTurn[], note: string) => void;
  /** Regenerate the last reply with the note as its direction. */
  onRewrite: (note: string) => void | Promise<void>;
  /** Hold the note and apply it to the next reply instead. */
  onSaveForNext: (note: string) => void;
  canRewrite: boolean;
  busy: boolean;
}

const QUICK_PROMPT_KEYS = [
  "ui.chat.forkdirector.quickOutOfCharacter",
  "ui.chat.forkdirector.quickSlowDown",
  "ui.chat.forkdirector.quickWouldNotKnow",
  "ui.chat.forkdirector.quickMoreDialogue",
] as const;

export function ForkDirectorPanel({
  chatId,
  turns,
  note,
  onChange,
  onRewrite,
  onSaveForNext,
  canRewrite,
  busy,
}: Props) {
  const debugMode = useUIStore((s) => s.debugMode);
  const { t: localizeUi } = useUiTranslation();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, sending]);

  // The composer grows with what is typed: a direction is often a sentence or three, and a
  // single-line box made the earlier version feel like it only wanted a few words.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 120)}px`;
  }, [draft]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const nextTurns: DirectorTurn[] = [...turns, { role: "user", content: trimmed }];
      onChange(nextTurns, note);
      setDraft("");
      setSending(true);
      try {
        const data = await api.post<{ say: string; note: string }>("/fork-director/talk", {
          chatId,
          messages: nextTurns,
          // So the Director builds on the note as it stands, edits included.
          note,
          debugMode,
        });
        onChange([...nextTurns, { role: "assistant", content: data.say }], data.note || note);
      } catch (error) {
        // Put the message back so nothing typed is lost.
        onChange(turns, note);
        setDraft(trimmed);
        toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkdirector.couldNotReachTheModel"));
      } finally {
        setSending(false);
      }
    },
    [chatId, debugMode, localizeUi, note, onChange, sending, turns],
  );

  const empty = turns.length === 0 && !sending;
  // Each answer from the Director is another take on the note.
  const takeNumber = Math.max(1, turns.filter((turn) => turn.role === "assistant").length);

  return (
    // On a phone the dialog is full screen and the panel fills it, so the note sits at the bottom
    // instead of leaving a dead band under it; on a wider screen it keeps to its old height.
    <div className="flex min-h-[24rem] flex-1 flex-col sm:max-h-[72vh]">
      <div className="flex items-start justify-between gap-2 pb-2">
        <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkdirector.offTheRecord")}</p>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              const ok = await showConfirmDialog({
                title: localizeUi("ui.chat.forkdirector.startOver"),
                message: localizeUi("ui.chat.forkdirector.startOverBody"),
                confirmLabel: localizeUi("ui.chat.forkdirector.startOverConfirm"),
                chatStyle: true,
              });
              if (ok) onChange([], "");
            }}
            disabled={sending}
            className="flex min-h-10 shrink-0 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-semibold text-[var(--muted-foreground)] hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw size="0.6875rem" />
            {localizeUi("ui.chat.forkdirector.startOver")}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {empty && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="max-w-[18rem] text-sm text-[var(--muted-foreground)]">
              {localizeUi("ui.chat.forkdirector.emptyHint")}
            </p>
            {/* In an empty panel the openers are the whole interface, so they are the thing to
                reach for rather than a strip of chips tucked under the conversation. */}
            <div className="flex w-full flex-col gap-1.5">
              {QUICK_PROMPT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => void send(localizeUi(key))}
                  className="min-h-11 rounded-xl bg-[var(--secondary)] px-3 text-sm font-semibold text-foreground/80 hover:bg-[var(--secondary)]/70"
                >
                  {localizeUi(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <div
              key={`${turn.role}-${index}`}
              className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-[linear-gradient(135deg,var(--primary),color-mix(in_srgb,var(--primary)_70%,black))] px-4 py-2.5 text-sm leading-relaxed text-[var(--primary-foreground)] shadow-[0_4px_14px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
            >
              {turn.content}
            </div>
          ) : (
            <div key={`${turn.role}-${index}`} className="mr-auto flex max-w-[92%] items-end gap-2">
              <DirectorAvatar />
              <div className="whitespace-pre-wrap rounded-3xl rounded-bl-md border border-[var(--border)] bg-[var(--secondary)] px-4 py-2.5 text-sm leading-relaxed text-foreground shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                {turn.content}
              </div>
            </div>
          ),
        )}
        {sending && (
          <div className="mr-auto flex items-end gap-2">
            <DirectorAvatar />
            <div className="flex items-center gap-2 rounded-3xl rounded-bl-md border border-[var(--border)] bg-[var(--secondary)] px-4 py-2.5 text-sm text-[var(--muted-foreground)]">
              <Loader2 size="0.875rem" className="animate-spin" />
              {localizeUi("ui.chat.forkdirector.thinking")}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!empty && (
        <div className="flex gap-1.5 overflow-x-auto pt-2">
          {QUICK_PROMPT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => void send(localizeUi(key))}
              disabled={sending}
              className="min-h-9 shrink-0 rounded-full bg-[var(--secondary)] px-3 text-xs font-semibold text-foreground/80 disabled:opacity-50"
            >
              {localizeUi(key)}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 pt-2">
        <label className="sr-only" htmlFor="fork-director-input">
          {localizeUi("ui.chat.forkdirector.talkItOut")}
        </label>
        <textarea
          id="fork-director-input"
          ref={inputRef}
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder={localizeUi("ui.chat.forkdirector.talkItOut")}
          className="max-h-30 min-h-11 flex-1 resize-none rounded-2xl bg-[var(--secondary)] px-4 py-3 text-sm text-foreground outline-none"
        />
        <button
          type="button"
          onClick={() => void send(draft)}
          disabled={sending || draft.trim().length === 0}
          aria-label={localizeUi("ui.chat.forkdirector.send")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
        >
          <SendHorizontal size="0.875rem" />
        </button>
      </div>

      {/* The note and the two buttons are what you came for, so they are pinned under the
          conversation rather than scrolling away inside it. The note is editable: the model's
          wording is a starting point, not a verdict. */}
      {/* The note is a film slate: a striped clapper bar, then the board you chalk the direction on.
          The board is always dark, as a slate is, but tinted with the theme's colour. */}
      <div className="mt-3 overflow-hidden rounded-xl shadow-[0_8px_22px_rgba(0,0,0,0.35)]">
        <div
          aria-hidden="true"
          className="h-4 origin-bottom-left -rotate-[2deg] bg-[repeating-linear-gradient(-45deg,#f5f2ea_0_12px,color-mix(in_srgb,var(--primary)_14%,#121218)_12px_24px)]"
        />
        <div className="bg-[color-mix(in_srgb,var(--primary)_14%,#121218)] p-3 text-[#f5f2ea]">
          <div className="mb-1.5 flex items-center justify-between border-b border-[#f5f2ea]/25 pb-1.5 font-mono text-[0.6875rem] font-bold uppercase tracking-[0.18em]">
            <label htmlFor="fork-director-note">{localizeUi("ui.chat.forkdirector.theNoteIllUse")}</label>
            <span className="text-[#f5f2ea]/70">{localizeUi("ui.chat.forkdirector.take", { take: takeNumber })}</span>
          </div>
          <textarea
            id="fork-director-note"
            value={note}
            rows={2}
            onChange={(event) => onChange(turns, event.target.value)}
            placeholder={localizeUi("ui.chat.forkdirector.notePlaceholder")}
            className="w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-[#f5f2ea] outline-none [field-sizing:content] placeholder:text-[#f5f2ea]/45"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void onRewrite(note)}
              disabled={!note.trim() || !canRewrite || busy || sending}
              className="min-h-11 flex-1 rounded-lg bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
            >
              {localizeUi("ui.chat.forkdirector.rewriteReply")}
            </button>
            <button
              type="button"
              onClick={() => onSaveForNext(note)}
              disabled={!note.trim() || busy || sending}
              className="min-h-11 rounded-lg border-2 border-[#f5f2ea]/35 px-4 text-sm font-bold text-[#f5f2ea] disabled:opacity-50"
            >
              {localizeUi("ui.chat.forkdirector.saveForNext")}
            </button>
          </div>
          {/* A disabled button that will not say why is the worst kind. */}
          {!canRewrite && note.trim() && (
            <p className="mt-1.5 text-[0.6875rem] text-[#f5f2ea]/70">
              {localizeUi("ui.chat.forkdirector.noReplyToRewriteYet")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DirectorAvatar() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,#121218)] text-[#f5f2ea] ring-2 ring-[color-mix(in_srgb,var(--primary)_60%,transparent)]"
    >
      <Clapperboard size="0.875rem" />
    </span>
  );
}
