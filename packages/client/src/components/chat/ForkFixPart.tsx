// ──────────────────────────────────────────────
// Fork: Fix this part, and the slop highlighter
// ──────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, RotateCcw, WandSparkles, X } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api-client";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { Modal } from "../ui/Modal";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui.store";
import { useForkSlopStore } from "../../stores/fork-slop.store";
import { findSlopMatches, locatePassage, passageOccurrence, replacePassage, sentenceAround } from "../../lib/fork/slop";
import { useBackDismiss } from "../../hooks/use-back-dismiss";
import { FORK_SWITCH_CLASS } from "../../lib/fork/switch";
import { isModalOverlayOpen } from "../../lib/modal-overlay-registry";

type MessageLike = { id: string; role: string; content: string };

interface Props {
  chatId: string;
  messages: readonly MessageLike[] | undefined;
  onEdit: (messageId: string, content: string) => void | Promise<void>;
  /** A reply is being written; nothing is fixed until it is done. */
  busy: boolean;
}

/** A passage picked on screen, before it is matched to the stored reply. */
interface Picked {
  messageId: string;
  text: string;
  rect: { top: number; bottom: number; left: number; width: number };
  /** Where it sits on screen, so it can glow while the sheet is open. */
  range: Range;
}

/** A passage matched to the stored reply, ready to rewrite. */
interface FixTarget {
  messageId: string;
  start: number;
  end: number;
  original: string;
  /** The passage as drawn on screen, lit up while the sheet is open. */
  glow: Range | null;
}

/** A slop mark on screen, kept so a tap on it can be traced back to its sentence. */
interface SlopMark {
  range: Range;
  content: Element;
  messageId: string;
  text: string;
  start: number;
  end: number;
}

const HIGHLIGHT_NAME = "fork-slop";
const TARGET_HIGHLIGHT_NAME = "fork-fix-target";
const ROLEPLAY_ROOT = '[data-chat-mode="roleplay"]';

const QUICK_FIX_KEYS = [
  "ui.chat.forkfix.quickLessCliche",
  "ui.chat.forkfix.quickInCharacter",
  "ui.chat.forkfix.quickShorter",
  "ui.chat.forkfix.quickShowDontTell",
] as const;

type HighlightRegistry = { set: (name: string, value: unknown) => void; delete: (name: string) => void };

function highlightRegistry(): HighlightRegistry | null {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
  return registry && typeof (globalThis as { Highlight?: unknown }).Highlight === "function" ? registry : null;
}

function elementOf(node: Node | null): Element | null {
  return node instanceof Element ? node : (node?.parentElement ?? null);
}

/** The text node and offset under a point, in whichever form this browser offers it. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** One message's rendered text, and a way back from an offset in it to a point in the page. */
function renderedText(content: Element) {
  const nodes: Array<{ node: Text; from: number }> = [];
  let text = "";
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, from: text.length });
    text += (node as Text).data;
  }
  const locate = (offset: number, isEnd: boolean) => {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const entry = nodes[index]!;
      if (offset > entry.from || (!isEnd && offset === entry.from)) {
        return { node: entry.node, offset: Math.min(offset - entry.from, entry.node.data.length) };
      }
    }
    return nodes[0] ? { node: nodes[0].node, offset: 0 } : null;
  };
  const rangeFor = (start: number, end: number): Range | null => {
    const from = locate(start, false);
    const to = locate(end, true);
    if (!from || !to) return null;
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    return range;
  };
  return { text, rangeFor };
}

/** Which copy of the passage the reader picked, counted in the reply as shown. */
function occurrenceOf(glow: Range | null, passage: string): number {
  const content = glow ? elementOf(glow.startContainer)?.closest(".mari-message-content") : null;
  if (!glow || !content) return 0;
  const before = document.createRange();
  before.setStart(content, 0);
  before.setEnd(glow.startContainer, glow.startOffset);
  return passageOccurrence(renderedText(content).text, before.toString().length, passage);
}

/** Ranges for every listed phrase in one message's rendered text. */
function marksIn(content: Element, messageId: string, phrases: readonly string[]): SlopMark[] {
  const { text, rangeFor } = renderedText(content);
  const marks: SlopMark[] = [];
  for (const match of findSlopMatches(text, phrases)) {
    const range = rangeFor(match.start, match.end);
    if (range) marks.push({ range, content, messageId, text, start: match.start, end: match.end });
  }
  return marks;
}

export function ForkFixPart({ chatId, messages, onEdit, busy }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const debugMode = useUIStore((s) => s.debugMode);
  const highlight = useForkSlopStore((s) => s.highlight);
  const lorebookButtonOn = useForkSlopStore((s) => s.lorebookButton);
  const phrases = useForkSlopStore((s) => s.phrases);
  const listOpen = useForkSlopStore((s) => s.listOpen);
  const setListOpen = useForkSlopStore((s) => s.setListOpen);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [target, setTarget] = useState<FixTarget | null>(null);
  const [instruction, setInstruction] = useState("");
  const [replacement, setReplacement] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const holdTargetRef = useRef(false);
  holdTargetRef.current = replacement !== null || rewriting;
  const [saving, setSaving] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const marksRef = useRef<SlopMark[]>([]);

  const replyById = useCallback(
    (messageId: string) => messagesRef.current?.find((message) => message.id === messageId && message.role !== "user"),
    [],
  );

  // Open the editor on a passage of the stored reply. A passage the stored text does not contain
  // (a display-only regex rewrote it) cannot be fixed safely, so it says so instead.
  const openFix = useCallback(
    (messageId: string, passage: string, glow: Range | null) => {
      const reply = replyById(messageId);
      const found = reply ? locatePassage(reply.content, passage, occurrenceOf(glow, passage)) : null;
      if (!reply || !found) {
        toast.error(localizeUi("ui.chat.forkfix.couldNotFindPassage"));
        return;
      }
      setTarget({ messageId, ...found, original: reply.content.slice(found.start, found.end), glow });
      setReplacement(null);
      setInstruction("");
      setPicked(null);
      document.getSelection()?.removeAllRanges();
    },
    [localizeUi, replyById],
  );

  // ── Picking a passage: a selection inside one reply shows the button ──
  useEffect(() => {
    let frame = 0;
    const read = () => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return setPicked(null);
      const range = selection.getRangeAt(0);
      const content = elementOf(range.startContainer)?.closest(".mari-message-content");
      if (!content || content !== elementOf(range.endContainer)?.closest(".mari-message-content")) {
        return setPicked(null);
      }
      if (!content.closest(ROLEPLAY_ROOT)) return setPicked(null);
      const messageId = content.closest("[data-message-id]")?.getAttribute("data-message-id") ?? "";
      const text = selection.toString();
      if (!messageId || !replyById(messageId) || text.trim().length < 2) return setPicked(null);
      const box = range.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) return setPicked(null);
      setPicked({
        messageId,
        text,
        rect: { top: box.top, bottom: box.bottom, left: box.left, width: box.width },
        range: range.cloneRange(),
      });
    };
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [replyById]);

  // ── The highlighter: marks drawn by the browser over the text, so the message is never changed ──
  useEffect(() => {
    const registry = highlightRegistry();
    if (!registry) return;
    if (!highlight || phrases.length === 0) {
      registry.delete(HIGHLIGHT_NAME);
      marksRef.current = [];
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scan = () => {
      const marks: SlopMark[] = [];
      for (const row of document.querySelectorAll(`${ROLEPLAY_ROOT} [data-message-id]`)) {
        const messageId = row.getAttribute("data-message-id") ?? "";
        if (!replyById(messageId)) continue;
        for (const content of row.querySelectorAll(".mari-message-content")) {
          marks.push(...marksIn(content, messageId, phrases));
        }
      }
      marksRef.current = marks;
      const HighlightCtor = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
      registry.set(HIGHLIGHT_NAME, new HighlightCtor(...marks.map((mark) => mark.range)));
    };
    scan();
    // A reply streams in a token at a time, so wait for the page to settle before scanning again.
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scan, 300);
    });
    const root = document.querySelector(ROLEPLAY_ROOT);
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      registry.delete(HIGHLIGHT_NAME);
      marksRef.current = [];
    };
  }, [highlight, phrases, replyById]);

  // ── Tapping a mark opens the fixer on its sentence ──
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // A rewrite waiting to be used is not thrown away by tapping another mark.
      if (busy || holdTargetRef.current || marksRef.current.length === 0) return;
      const selection = document.getSelection();
      if (selection && !selection.isCollapsed) return;
      const caret = caretAt(event.clientX, event.clientY);
      if (!caret) return;
      const hit = marksRef.current.find((mark) => {
        try {
          return mark.range.isPointInRange(caret.node, caret.offset);
        } catch {
          return false;
        }
      });
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      const sentence = sentenceAround(hit.text, hit.start, hit.end);
      openFix(
        hit.messageId,
        hit.text.slice(sentence.start, sentence.end),
        renderedText(hit.content).rangeFor(sentence.start, sentence.end),
      );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [busy, openFix]);

  // ── While the sheet is open, the passage glows in the reply, which is scrolled up above the sheet ──
  const glow = target?.glow ?? null;
  useEffect(() => {
    const registry = highlightRegistry();
    if (!glow) return;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (registry && HighlightCtor) registry.set(TARGET_HIGHLIGHT_NAME, new HighlightCtor(glow));
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    elementOf(glow.startContainer)?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    return () => registry?.delete(TARGET_HIGHLIGHT_NAME);
  }, [glow]);

  const closeSheet = useCallback(() => {
    if (!saving) setTarget(null);
  }, [saving]);
  // The phone's back button closes the sheet, the way it closes Marinara's own dialogs.
  useBackDismiss(Boolean(target), closeSheet);
  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape that cancels typing in an IME, or closes a dialog opened over the sheet, is not for us.
      if (event.key !== "Escape" || event.isComposing || isModalOverlayOpen()) return;
      closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, closeSheet]);

  const rewrite = async () => {
    if (!target || rewriting) return;
    setRewriting(true);
    try {
      const data = await api.post<{ replacement: string }>("/fork-fix/part", {
        chatId,
        messageId: target.messageId,
        start: target.start,
        end: target.end,
        expected: target.original,
        instruction,
        avoid: phrases,
        debugMode,
      });
      setReplacement(data.replacement);
      setShowBefore(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : localizeUi("ui.chat.forkfix.couldNotRewrite"));
    } finally {
      setRewriting(false);
    }
  };

  const accept = async () => {
    if (!target || replacement === null || saving) return;
    const reply = replyById(target.messageId);
    // Never splice into a reply that changed underneath the fixer.
    if (!reply || reply.content.slice(target.start, target.end) !== target.original) {
      toast.error(localizeUi("ui.chat.forkfix.replyChanged"));
      return;
    }
    setSaving(true);
    try {
      await onEdit(target.messageId, replacePassage(reply.content, target.start, target.end, replacement));
      setTarget(null);
      toast.success(localizeUi("ui.chat.forkfix.fixed"));
    } catch {
      toast.error(localizeUi("ui.chat.forkfix.couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  // Marinara's own "Add to lorebook" button sits just under a selection of up to 200 characters,
  // centred the same way; this one stacks under it, or takes its place when it is not shown.
  const lorebookButtonShown =
    lorebookButtonOn && picked ? picked.text.replace(/\s+/g, " ").trim().length <= 200 : false;
  const buttonTop = picked ? Math.min(picked.rect.bottom + (lorebookButtonShown ? 52 : 8), window.innerHeight - 52) : 0;
  const buttonLeft = picked
    ? Math.min(Math.max(picked.rect.left + picked.rect.width / 2, 80), window.innerWidth - 80)
    : 0;

  return (
    <>
      <style>{`::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(255, 170, 40, 0.22); text-decoration: underline wavy rgba(255, 150, 30, 0.9); text-underline-offset: 3px; }
::highlight(${TARGET_HIGHLIGHT_NAME}) { background-color: color-mix(in srgb, var(--primary) 38%, transparent); color: var(--foreground); }`}</style>

      {picked &&
        !busy &&
        !target &&
        createPortal(
          <button
            type="button"
            // Keep the selection: a press that cleared it would lose what was picked.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => openFix(picked.messageId, picked.text, picked.range)}
            style={{ top: buttonTop, left: buttonLeft }}
            className="fixed z-[9998] flex min-h-10 -translate-x-1/2 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--primary)] px-3.5 text-sm font-bold text-[var(--primary-foreground)] shadow-lg shadow-black/30"
          >
            <WandSparkles size="0.875rem" />
            {localizeUi("ui.chat.forkfix.fixThisPart")}
          </button>,
          document.body,
        )}

      {target &&
        createPortal(
          <section
            role="dialog"
            aria-modal="false"
            aria-label={localizeUi("ui.chat.forkfix.title")}
            // A theme's card colour can be see-through; laid over the page background it never is.
            style={{ background: "linear-gradient(var(--card), var(--card)), var(--background)" }}
            className="fixed inset-x-0 bottom-0 z-[9990] mx-auto flex max-h-[62vh] w-full max-w-2xl flex-col rounded-t-3xl border border-b-0 border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
          >
            <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-foreground/20" />
            <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-2">
              <WandSparkles size="1rem" className="text-[var(--primary)]" />
              <h2 className="flex-1 text-sm font-bold text-foreground">{localizeUi("ui.chat.forkfix.title")}</h2>
              <button
                type="button"
                onClick={closeSheet}
                aria-label={localizeUi("ui.chat.forkfix.close")}
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-foreground/10"
              >
                <X size="1rem" />
              </button>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,var(--mari-safe-area-inset-bottom,env(safe-area-inset-bottom)))]">
              {replacement !== null && (
                <div
                  role="group"
                  aria-label={localizeUi("ui.chat.forkfix.compare")}
                  className="flex self-start rounded-full bg-[var(--secondary)] p-1 text-xs font-bold"
                >
                  {[false, true].map((before) => (
                    <button
                      key={String(before)}
                      type="button"
                      onClick={() => setShowBefore(before)}
                      aria-pressed={showBefore === before}
                      className={cn(
                        "min-h-9 rounded-full px-4 transition-colors",
                        showBefore === before
                          ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "text-foreground/70",
                      )}
                    >
                      {localizeUi(before ? "ui.chat.forkfix.before" : "ui.chat.forkfix.after")}
                    </button>
                  ))}
                </div>
              )}
              <p
                className={cn(
                  "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed text-foreground",
                  replacement !== null && !showBefore
                    ? "border-2 border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] shadow-[0_0_16px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
                    : "border border-[var(--border)] bg-[var(--secondary)]/60 text-foreground/85",
                )}
              >
                {replacement !== null && !showBefore ? replacement : target.original}
              </p>

              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
                {QUICK_FIX_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInstruction(localizeUi(key))}
                    aria-pressed={instruction === localizeUi(key)}
                    className={cn(
                      "min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors",
                      instruction === localizeUi(key)
                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-foreground"
                        : "border-[var(--border)] text-foreground/80",
                    )}
                  >
                    {localizeUi(key)}
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="fork-fix-instruction">
                {localizeUi("ui.chat.forkfix.whatToChange")}
              </label>
              <textarea
                id="fork-fix-instruction"
                value={instruction}
                rows={2}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={localizeUi("ui.chat.forkfix.whatToChange")}
                className="w-full resize-none rounded-2xl bg-[var(--secondary)] px-3.5 py-2.5 text-sm text-foreground outline-none"
              />

              <div className="flex gap-2">
                {replacement === null ? (
                  <button
                    type="button"
                    onClick={() => void rewrite()}
                    disabled={rewriting || busy}
                    className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
                  >
                    {rewriting ? (
                      <Loader2 size="0.875rem" className="animate-spin" />
                    ) : (
                      <WandSparkles size="0.875rem" />
                    )}
                    {localizeUi("ui.chat.forkfix.rewrite")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void accept()}
                      disabled={saving || rewriting || busy}
                      className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
                    >
                      {saving && <Loader2 size="0.875rem" className="animate-spin" />}
                      {localizeUi("ui.chat.forkfix.useIt")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void rewrite()}
                      disabled={saving || rewriting || busy}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--border)] px-4 text-sm font-bold text-foreground disabled:opacity-50"
                    >
                      {rewriting ? <Loader2 size="0.875rem" className="animate-spin" /> : <RotateCcw size="0.875rem" />}
                      {localizeUi("ui.chat.forkfix.tryAgain")}
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>,
          document.body,
        )}

      <Modal
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={localizeUi("ui.chat.forkfix.slopListTitle")}
        width="max-w-md"
        mobileFullscreen
      >
        <SlopListEditor
          latestReply={[...(messages ?? [])].reverse().find((message) => message.role !== "user")?.content ?? ""}
        />
      </Modal>
    </>
  );
}

/**
 * The phrase list as chips you can remove, an add box, the two switches, and how much of the
 * newest reply is on the list, so the list can be tuned against what the model is actually writing.
 */
function SlopListEditor({ latestReply }: { latestReply: string }) {
  const { t: localizeUi } = useUiTranslation();
  const highlight = useForkSlopStore((s) => s.highlight);
  const lorebookButton = useForkSlopStore((s) => s.lorebookButton);
  const setLorebookButton = useForkSlopStore((s) => s.setLorebookButton);
  const setHighlight = useForkSlopStore((s) => s.setHighlight);
  const phrases = useForkSlopStore((s) => s.phrases);
  const setPhrases = useForkSlopStore((s) => s.setPhrases);
  const resetPhrases = useForkSlopStore((s) => s.resetPhrases);
  const [adding, setAdding] = useState("");

  const matches = latestReply ? findSlopMatches(latestReply, phrases) : [];
  // Curly and straight apostrophes match each other, so compare them as one.
  const key = (text: string) => text.replace(/’/g, "'").toLocaleLowerCase();
  const found = new Set(matches.map((match) => key(latestReply.slice(match.start, match.end))));
  const inLatest = (phrase: string) => found.has(key(phrase.trim()));

  const add = () => {
    const phrase = adding.trim();
    if (!phrase) return;
    if (!phrases.some((existing) => key(existing.trim()) === key(phrase))) {
      setPhrases([phrase, ...phrases]);
    }
    setAdding("");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkfix.slopListHelp")}</p>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm font-semibold",
          matches.length > 0
            ? "bg-[rgba(255,160,40,0.14)] text-foreground"
            : "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground",
        )}
      >
        {latestReply
          ? localizeUi("ui.chat.forkfix.slopCount", { count: matches.length })
          : localizeUi("ui.chat.forkfix.slopCountNoReply")}
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-sm font-semibold text-foreground">
        {localizeUi("ui.chat.forkfix.highlightInReplies")}
        <input
          type="checkbox"
          role="switch"
          checked={highlight}
          onChange={(event) => setHighlight(event.target.checked)}
          className={FORK_SWITCH_CLASS}
        />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-sm font-semibold text-foreground">
        {localizeUi("ui.chat.forkfix.showAddToLorebook")}
        <input
          type="checkbox"
          role="switch"
          checked={lorebookButton}
          onChange={(event) => setLorebookButton(event.target.checked)}
          className={FORK_SWITCH_CLASS}
        />
      </label>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className="sr-only" htmlFor="fork-slop-add">
          {localizeUi("ui.chat.forkfix.addPhrase")}
        </label>
        <input
          id="fork-slop-add"
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          placeholder={localizeUi("ui.chat.forkfix.addPhrasePlaceholder")}
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-[var(--secondary)] px-3 text-sm text-foreground outline-none"
        />
        <button
          type="submit"
          disabled={!adding.trim()}
          aria-label={localizeUi("ui.chat.forkfix.addPhrase")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
        >
          <Plus size="1rem" />
        </button>
      </form>

      <ul className="flex flex-wrap gap-1.5" aria-label={localizeUi("ui.chat.forkfix.slopListTitle")}>
        {phrases.map((phrase, index) => (
          <li
            key={`${index}-${phrase}`}
            className={cn(
              "flex min-h-10 items-center gap-0.5 rounded-full border pl-3 pr-0.5 text-xs font-semibold",
              inLatest(phrase)
                ? "border-[rgba(255,150,30,0.7)] bg-[rgba(255,160,40,0.16)] text-foreground"
                : "border-[var(--border)] bg-[var(--secondary)] text-foreground/85",
            )}
          >
            <span>{phrase}</span>
            <button
              type="button"
              onClick={() => setPhrases(phrases.filter((entry) => entry !== phrase))}
              aria-label={localizeUi("ui.chat.forkfix.removePhrase", { phrase })}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-foreground/10"
            >
              <X size="0.75rem" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={async () => {
          // One tap would otherwise throw away every phrase you added.
          const ok = await showConfirmDialog({
            title: localizeUi("ui.chat.forkfix.resetList"),
            message: localizeUi("ui.chat.forkfix.resetListBody"),
            confirmLabel: localizeUi("ui.chat.forkfix.resetListConfirm"),
            chatStyle: true,
          });
          if (ok) resetPhrases();
        }}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] text-sm font-semibold text-foreground"
      >
        <RotateCcw size="0.875rem" />
        {localizeUi("ui.chat.forkfix.resetList")}
      </button>
    </div>
  );
}
