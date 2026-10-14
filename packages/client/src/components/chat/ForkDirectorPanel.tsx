// ──────────────────────────────────────────────
// Fork: the Director's chair — talk out the next reply off the record
// ──────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api-client";

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
  const { t: localizeUi } = useUiTranslation();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, sending]);

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
    [chatId, localizeUi, note, onChange, sending, turns],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkdirector.offTheRecord")}</p>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {turns.length === 0 && !sending && (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            {localizeUi("ui.chat.forkdirector.emptyHint")}
          </p>
        )}
        {turns.map((turn, index) => (
          <div
            key={`${turn.role}-${index}`}
            className={
              turn.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--primary)] px-3 py-2 text-sm text-[var(--primary-foreground)]"
                : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm bg-[var(--secondary)] px-3 py-2 text-sm text-foreground"
            }
          >
            {turn.content}
          </div>
        ))}
        {sending && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl bg-[var(--secondary)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
            <Loader2 size="0.875rem" className="animate-spin" />
            {localizeUi("ui.chat.forkdirector.thinking")}
          </div>
        )}
        {note && (
          <div className="rounded-xl border border-dashed border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-2">
            <div className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--primary)]">
              {localizeUi("ui.chat.forkdirector.theNoteIllUse")}
            </div>
            <div className="mt-1 text-sm text-foreground">{note}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {QUICK_PROMPT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => void send(localizeUi(key))}
            disabled={sending}
            className="min-h-11 shrink-0 rounded-full bg-[var(--secondary)] px-3 text-xs font-semibold text-foreground/80 disabled:opacity-50"
          >
            {localizeUi(key)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="fork-director-input">
          {localizeUi("ui.chat.forkdirector.talkItOut")}
        </label>
        <input
          id="fork-director-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder={localizeUi("ui.chat.forkdirector.talkItOut")}
          className="min-h-11 flex-1 rounded-full bg-[var(--secondary)] px-4 text-sm text-foreground outline-none"
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void onRewrite(note)}
          disabled={!note || !canRewrite || busy || sending}
          className="min-h-12 flex-1 rounded-xl bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
          title={canRewrite ? undefined : localizeUi("ui.chat.forkdirector.noReplyToRewriteYet")}
        >
          {localizeUi("ui.chat.forkdirector.rewriteReply")}
        </button>
        <button
          type="button"
          onClick={() => onSaveForNext(note)}
          disabled={!note || busy || sending}
          className="min-h-12 rounded-xl border-2 border-[var(--border)] px-4 text-sm font-bold text-foreground disabled:opacity-50"
        >
          {localizeUi("ui.chat.forkdirector.saveForNext")}
        </button>
      </div>
    </div>
  );
}
