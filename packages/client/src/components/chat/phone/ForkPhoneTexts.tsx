// ──────────────────────────────────────────────
// Fork: Pocket Phone — swipes, Fix this part and edits on texts (see FORK.md)
// ──────────────────────────────────────────────
// A character's newest text swipes like a story reply (left for a new version, right to go back);
// long-press any of their texts to fix it; your own texts can be edited. The writer reads whatever
// the text says now.
import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, WandSparkles } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { useEditText, useFixText, useSwipeText, type PhoneMessage } from "../../../hooks/use-fork-phone";
import { followOffset, isCommittedSwipe, isSidewaysDrag, swipeOutcome } from "../../../lib/fork/swipe-feel";
import { cn } from "../../../lib/utils";

const LONG_PRESS_MS = 550;
const QUICK_FIX_KEYS = [
  "ui.chat.forkfix.quickLessCliche",
  "ui.chat.forkfix.quickInCharacter",
  "ui.chat.forkfix.quickShorter",
] as const;

/** A bubble that follows a sideways drag (when it can swipe) and opens its tools on a long press. */
export function PhoneBubble({
  className,
  children,
  onSwipe,
  onLongPress,
}: {
  className: string;
  children: ReactNode;
  /** Let go after a swipe this way (dx < 0 is left). */
  onSwipe?: (dx: number) => void;
  onLongPress?: () => void;
}) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  const [offset, setOffset] = useState(0);
  const stopTimer = () => window.clearTimeout(timer.current);
  const press = () => {
    if (pressed.current || !onLongPress) return;
    pressed.current = true;
    navigator.vibrate?.(10);
    onLongPress();
  };
  return (
    <div
      className={className}
      style={{ transform: offset ? `translateX(${offset}px)` : undefined, touchAction: "pan-y" }}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        pressed.current = false;
        stopTimer();
        if (onLongPress) timer.current = window.setTimeout(press, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        if (!start.current || start.current.id !== event.pointerId) return;
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) stopTimer();
        if (onSwipe && isSidewaysDrag(dx, dy)) setOffset(followOffset(dx));
      }}
      onPointerUp={(event) => {
        stopTimer();
        const from = start.current;
        start.current = null;
        setOffset(0);
        if (!from || !onSwipe || pressed.current) return;
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        if (isCommittedSwipe(dx, dy)) onSwipe(dx);
      }}
      onPointerCancel={() => {
        stopTimer();
        start.current = null;
        setOffset(0);
      }}
      // A right click, or the long press some phones turn into one.
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        stopTimer();
        press();
      }}
    >
      {children}
    </div>
  );
}

/** The ‹ 1/2 › row under their newest text, and its fix button. */
export function SwipeRow({
  swipe,
  message,
  onFix,
}: {
  /** Shared with the thumb gesture, so either shows the same spinner. */
  swipe: ReturnType<typeof useSwipeText>;
  message: PhoneMessage;
  onFix: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const count = Math.max(1, message.swipes.length);
  const active = Math.min(message.activeSwipe, count - 1);
  return (
    <span className="fp-time flex items-center gap-0.5">
      <button
        type="button"
        disabled={active === 0 || swipe.isPending}
        onClick={() => swipe.mutate({ id: message.id, to: active - 1 })}
        aria-label={localizeUi("ui.chat.forkphone.textPrevious")}
        className="flex h-8 w-8 items-center justify-center disabled:opacity-30"
      >
        <ChevronLeft size="0.875rem" />
      </button>
      <span className="min-w-[2.25rem] text-center tabular-nums">
        {swipe.isPending && swipe.variables?.to === undefined ? (
          <Loader2 size="0.75rem" className="mx-auto animate-spin" />
        ) : (
          localizeUi("ui.chat.forkphone.textVersion", { n: active + 1, count })
        )}
      </span>
      <button
        type="button"
        disabled={swipe.isPending}
        onClick={() =>
          active < count - 1 ? swipe.mutate({ id: message.id, to: active + 1 }) : swipe.mutate({ id: message.id })
        }
        aria-label={localizeUi(active < count - 1 ? "ui.chat.forkphone.textNext" : "ui.chat.forkphone.textNew")}
        className="flex h-8 w-8 items-center justify-center disabled:opacity-30"
      >
        {active < count - 1 ? <ChevronRight size="0.875rem" /> : <Sparkles size="0.8125rem" />}
      </button>
      <button
        type="button"
        onClick={onFix}
        aria-label={localizeUi("ui.chat.forkphone.fixText")}
        className="flex h-8 w-8 items-center justify-center"
      >
        <WandSparkles size="0.8125rem" />
      </button>
    </span>
  );
}

/** What a swipe on their newest text does: an earlier version, a later one, or a new one. */
export function swipeText(swipe: ReturnType<typeof useSwipeText>, message: PhoneMessage, dx: number) {
  if (swipe.isPending) return;
  const outcome = swipeOutcome(dx, message.activeSwipe, Math.max(1, message.swipes.length), true);
  if (outcome.kind === "new") {
    navigator.vibrate?.(12);
    swipe.mutate({ id: message.id });
  } else if (outcome.kind !== "none") swipe.mutate({ id: message.id, to: outcome.index });
}

/** Fix this part for a text: pick what to change, see the rewrite, keep it or not. */
export function PhoneFixPanel({
  chatId,
  message,
  onClose,
}: {
  chatId: string;
  message: PhoneMessage;
  onClose: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const fix = useFixText(chatId);
  const save = useEditText(chatId);
  const [instruction, setInstruction] = useState("");
  const replacement = fix.data?.replacement ?? null;
  const rewrite = () => fix.mutate({ id: message.id, instruction });
  return (
    <div className="fp-tools">
      <p className="m-0 flex items-center gap-1.5 font-bold">
        <WandSparkles size="0.8125rem" />
        {localizeUi("ui.chat.forkphone.fixText")}
      </p>
      <p className="fp-tools-quote m-0">{replacement ?? message.body}</p>
      <div className="flex flex-wrap gap-1">
        {QUICK_FIX_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setInstruction(localizeUi(key))}
            aria-pressed={instruction === localizeUi(key)}
            className={cn("fp-chip", instruction === localizeUi(key) && "is-on")}
          >
            {localizeUi(key)}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="fork-phone-fix">
        {localizeUi("ui.chat.forkphone.fixPlaceholder")}
      </label>
      <input
        id="fork-phone-fix"
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={localizeUi("ui.chat.forkphone.fixPlaceholder")}
        className="fp-tools-input"
      />
      <div className="flex flex-wrap justify-end gap-1.5">
        <button type="button" onClick={onClose} className="fp-chip">
          {localizeUi("ui.chat.forkphone.cancel")}
        </button>
        <button type="button" onClick={rewrite} disabled={fix.isPending} className="fp-chip">
          {fix.isPending && <Loader2 size="0.75rem" className="animate-spin" />}
          {localizeUi(replacement === null ? "ui.chat.forkphone.rewrite" : "ui.chat.forkfix.tryAgain")}
        </button>
        {replacement !== null && (
          <button
            type="button"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { id: message.id, body: replacement },
                {
                  onSuccess: () => {
                    toast.success(localizeUi("ui.chat.forkfix.fixed"));
                    onClose();
                  },
                },
              )
            }
            className="fp-chip is-on"
          >
            {localizeUi("ui.chat.forkphone.keepFix")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Your own text, corrected. The story's writer reads the corrected version from then on. */
export function PhoneEditPanel({
  chatId,
  message,
  onClose,
}: {
  chatId: string;
  message: PhoneMessage;
  onClose: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const save = useEditText(chatId);
  const [body, setBody] = useState(message.body);
  return (
    <div className="fp-tools">
      <label className="m-0 font-bold" htmlFor="fork-phone-edit">
        {localizeUi("ui.chat.forkphone.editText")}
      </label>
      <textarea
        id="fork-phone-edit"
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        className="fp-tools-input fork-keep-size resize-none"
      />
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onClose} className="fp-chip">
          {localizeUi("ui.chat.forkphone.cancel")}
        </button>
        <button
          type="button"
          disabled={!body.trim() || body.trim() === message.body || save.isPending}
          onClick={() => save.mutate({ id: message.id, body }, { onSuccess: onClose })}
          className="fp-chip is-on"
        >
          {save.isPending && <Loader2 size="0.75rem" className="animate-spin" />}
          {localizeUi("ui.chat.forkphone.saveText")}
        </button>
      </div>
    </div>
  );
}
