// ──────────────────────────────────────────────
// Fork: Fix this part, and the slop highlighter
// ──────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RotateCcw, WandSparkles } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api-client";
import { Modal } from "../ui/Modal";
import { useUIStore } from "../../stores/ui.store";
import { useForkSlopStore } from "../../stores/fork-slop.store";
import { useForkDraftField } from "../../hooks/use-fork-draft-field";
import { findSlopMatches, locatePassage, replacePassage, sentenceAround } from "../../lib/fork/slop";

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
}

/** A passage matched to the stored reply, ready to rewrite. */
interface FixTarget {
  messageId: string;
  start: number;
  end: number;
  original: string;
}

/** A slop mark on screen, kept so a tap on it can be traced back to its sentence. */
interface SlopMark {
  range: Range;
  messageId: string;
  text: string;
  start: number;
  end: number;
}

const HIGHLIGHT_NAME = "fork-slop";
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

/** Ranges for every listed phrase in one message's rendered text. */
function marksIn(content: Element, messageId: string, phrases: readonly string[]): SlopMark[] {
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
  const marks: SlopMark[] = [];
  for (const match of findSlopMatches(text, phrases)) {
    const from = locate(match.start, false);
    const to = locate(match.end, true);
    if (!from || !to) continue;
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    marks.push({ range, messageId, text, start: match.start, end: match.end });
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
  const [saving, setSaving] = useState(false);
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
    (messageId: string, passage: string) => {
      const reply = replyById(messageId);
      const found = reply ? locatePassage(reply.content, passage) : null;
      if (!reply || !found) {
        toast.error(localizeUi("ui.chat.forkfix.couldNotFindPassage"));
        return;
      }
      setTarget({ messageId, ...found, original: reply.content.slice(found.start, found.end) });
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
      setPicked({ messageId, text, rect: { top: box.top, bottom: box.bottom, left: box.left, width: box.width } });
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
      if (busy || marksRef.current.length === 0) return;
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
      openFix(hit.messageId, hit.text.slice(sentence.start, sentence.end));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [busy, openFix]);

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
      <style>{`::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(255, 170, 40, 0.22); text-decoration: underline wavy rgba(255, 150, 30, 0.9); text-underline-offset: 3px; }`}</style>

      {picked &&
        !busy &&
        !target &&
        createPortal(
          <button
            type="button"
            // Keep the selection: a press that cleared it would lose what was picked.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => openFix(picked.messageId, picked.text)}
            style={{ top: buttonTop, left: buttonLeft }}
            className="fixed z-[9998] flex min-h-10 -translate-x-1/2 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--primary)] px-3.5 text-sm font-bold text-[var(--primary-foreground)] shadow-lg shadow-black/30"
          >
            <WandSparkles size="0.875rem" />
            {localizeUi("ui.chat.forkfix.fixThisPart")}
          </button>,
          document.body,
        )}

      <Modal
        open={Boolean(target)}
        onClose={() => !saving && setTarget(null)}
        title={localizeUi("ui.chat.forkfix.title")}
        width="max-w-lg"
        mobileFullscreen
      >
        {target && (
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 text-[0.625rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                {localizeUi("ui.chat.forkfix.thePart")}
              </div>
              <p className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 px-3 py-2 text-sm text-foreground/80">
                {target.original}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_FIX_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInstruction(localizeUi(key))}
                  className="min-h-9 rounded-full bg-[var(--secondary)] px-3 text-xs font-semibold text-foreground/80"
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
              className="w-full resize-none rounded-xl bg-[var(--secondary)] px-3 py-2 text-sm text-foreground outline-none"
            />

            {replacement !== null && (
              <div>
                <div className="mb-1 text-[0.625rem] font-bold uppercase tracking-wide text-[var(--primary)]">
                  {localizeUi("ui.chat.forkfix.newVersion")}
                </div>
                <p className="whitespace-pre-wrap rounded-xl border-2 border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-2 text-sm text-foreground">
                  {replacement}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {replacement === null ? (
                <button
                  type="button"
                  onClick={() => void rewrite()}
                  disabled={rewriting || busy}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
                >
                  {rewriting ? <Loader2 size="0.875rem" className="animate-spin" /> : <WandSparkles size="0.875rem" />}
                  {localizeUi("ui.chat.forkfix.rewrite")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void accept()}
                    disabled={saving || rewriting || busy}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] disabled:opacity-50"
                  >
                    {saving && <Loader2 size="0.875rem" className="animate-spin" />}
                    {localizeUi("ui.chat.forkfix.useIt")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rewrite()}
                    disabled={saving || rewriting || busy}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] px-4 text-sm font-bold text-foreground disabled:opacity-50"
                  >
                    {rewriting ? <Loader2 size="0.875rem" className="animate-spin" /> : <RotateCcw size="0.875rem" />}
                    {localizeUi("ui.chat.forkfix.tryAgain")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={localizeUi("ui.chat.forkfix.slopListTitle")}
        width="max-w-md"
        mobileFullscreen
      >
        <SlopListEditor />
      </Modal>
    </>
  );
}

/** The highlighter switch and the phrase list, one phrase per line. */
function SlopListEditor() {
  const { t: localizeUi } = useUiTranslation();
  const highlight = useForkSlopStore((s) => s.highlight);
  const lorebookButton = useForkSlopStore((s) => s.lorebookButton);
  const setLorebookButton = useForkSlopStore((s) => s.setLorebookButton);
  const setHighlight = useForkSlopStore((s) => s.setHighlight);
  const phrases = useForkSlopStore((s) => s.phrases);
  const setPhrases = useForkSlopStore((s) => s.setPhrases);
  const resetPhrases = useForkSlopStore((s) => s.resetPhrases);
  const [draft, change, flush] = useForkDraftField(phrases.join("\n"), (text) =>
    setPhrases(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.chat.forkfix.slopListHelp")}</p>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-sm font-semibold text-foreground">
        {localizeUi("ui.chat.forkfix.highlightInReplies")}
        <input
          type="checkbox"
          checked={highlight}
          onChange={(event) => setHighlight(event.target.checked)}
          className="h-5 w-5 accent-[var(--primary)]"
        />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 text-sm font-semibold text-foreground">
        {localizeUi("ui.chat.forkfix.showAddToLorebook")}
        <input
          type="checkbox"
          checked={lorebookButton}
          onChange={(event) => setLorebookButton(event.target.checked)}
          className="h-5 w-5 accent-[var(--primary)]"
        />
      </label>
      <label className="sr-only" htmlFor="fork-slop-list">
        {localizeUi("ui.chat.forkfix.slopListTitle")}
      </label>
      <textarea
        id="fork-slop-list"
        value={draft}
        onChange={(event) => change(event.target.value)}
        onBlur={flush}
        rows={12}
        className="w-full resize-y rounded-xl bg-[var(--secondary)] px-3 py-2 font-mono text-xs text-foreground outline-none"
      />
      <button
        type="button"
        onClick={resetPhrases}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] text-sm font-semibold text-foreground"
      >
        <RotateCcw size="0.875rem" />
        {localizeUi("ui.chat.forkfix.resetList")}
      </button>
    </div>
  );
}
