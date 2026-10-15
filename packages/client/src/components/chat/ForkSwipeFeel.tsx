// ──────────────────────────────────────────────
// Fork: the newest reply follows your thumb while you swipe it (see FORK.md)
// ──────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui.store";
import { followOffset, isCommittedSwipe, isSidewaysDrag, swipeOutcome } from "../../lib/fork/swipe-feel";

/** The same places Marinara's swipe ignores: controls, fields, menus and anything marked so. */
const IGNORE =
  'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [data-radix-popper-content-wrapper], [data-no-intuitive-swipe]';

/**
 * Feedback only: Marinara's "Intuitive swipe navigation" does the swiping. While a sideways drag is
 * under way the newest reply slides with the thumb and a counter says where it lands ("2/3", or
 * "new" when a fresh one will be written). Android gives a short buzz when a new one starts.
 */
export function ForkSwipeFeel({
  message,
  busy,
}: {
  message: { id: string; activeSwipeIndex?: number | null; swipeCount?: number | null } | null;
  busy: boolean;
}) {
  const { t: localizeUi } = useUiTranslation();
  const enabled = useUIStore((s) => s.intuitiveSwipeNavigation);
  const rerollAtEnd = useUIStore((s) => s.intuitiveSwipeRerollLatest);
  const [badge, setBadge] = useState<{ text: string; top: number; left: number } | null>(null);
  const messageRef = useRef(message);
  messageRef.current = message;

  useEffect(() => {
    if (!enabled || busy || !matchMedia("(pointer: coarse)").matches) return;
    let start: { x: number; y: number } | null = null;
    let element: HTMLElement | null = null;

    const reset = (animate: boolean) => {
      if (element) {
        element.style.transition = animate ? "transform 180ms ease-out" : "";
        element.style.transform = "";
      }
      element = null;
      setBadge(null);
    };
    const onStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const selection = document.getSelection();
      start =
        event.touches.length === 1 &&
        target?.closest("[data-chat-scroll]") &&
        !target.closest(IGNORE) &&
        !(selection && !selection.isCollapsed)
          ? { x: event.touches[0]!.clientX, y: event.touches[0]!.clientY }
          : null;
    };
    const onMove = (event: TouchEvent) => {
      const current = messageRef.current;
      const touch = event.touches[0];
      if (!start || !touch || !current) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!isSidewaysDrag(dx, dy)) {
        if (element) reset(true);
        return;
      }
      element ??= document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(current.id)}"]`);
      if (!element) return;
      element.style.transition = "none";
      element.style.transform = `translateX(${followOffset(dx)}px)`;
      const count = Math.max(1, current.swipeCount ?? 1);
      const outcome = swipeOutcome(dx, current.activeSwipeIndex ?? 0, count, rerollAtEnd);
      const rect = element.getBoundingClientRect();
      const text =
        outcome.kind === "new"
          ? localizeUi("ui.chat.forkswipe.new")
          : outcome.kind === "none"
            ? `${(current.activeSwipeIndex ?? 0) + 1}/${count}`
            : `${outcome.index + 1}/${count}`;
      setBadge({ text, top: Math.max(56, rect.top + 8), left: rect.left + rect.width / 2 });
    };
    const onEnd = (event: TouchEvent) => {
      const current = messageRef.current;
      const touch = event.changedTouches[0];
      if (start && touch && current && element) {
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const outcome = swipeOutcome(dx, current.activeSwipeIndex ?? 0, current.swipeCount ?? 1, rerollAtEnd);
        // A new reply is on its way: a short buzz on phones that can (Android; iOS ignores it).
        if (isCommittedSwipe(dx, dy) && outcome.kind === "new") navigator.vibrate?.(12);
      }
      start = null;
      reset(true);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      reset(false);
    };
  }, [busy, enabled, localizeUi, rerollAtEnd]);

  if (!badge) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-full bg-[var(--primary)] px-2.5 py-0.5 text-xs font-bold text-[var(--primary-foreground)] shadow-lg"
      style={{ top: badge.top, left: badge.left }}
    >
      {badge.text}
    </div>
  );
}
