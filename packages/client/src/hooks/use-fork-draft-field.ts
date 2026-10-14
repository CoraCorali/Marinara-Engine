// ──────────────────────────────────────────────
// Fork: an editable field that saves once you stop, not once per keystroke
// ──────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hold what is being typed locally and save it a moment after typing stops.
 *
 * The first cut of the closet and the tracker called the mutation straight from onChange, which
 * meant one PATCH per character typed and one per step of a dragged slider. Besides the traffic,
 * the responses arrive out of order and the query invalidation they trigger can overwrite the box
 * mid-word with a stale value.
 *
 * The pending edit always wins over what comes back from the server, so a save landing while you
 * are still typing cannot pull the text out from under you. Whatever is pending is flushed on
 * unmount, so closing the panel mid-edit does not lose it.
 */
export function useForkDraftField<T>(
  value: T,
  commit: (next: T) => void,
  delay = 500,
): [T, (next: T) => void, () => void] {
  const [draft, setDraft] = useState<T>(value);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T>(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // Take the server's value only while nothing is waiting to be saved.
  useEffect(() => {
    if (!dirtyRef.current) {
      setDraft(value);
      pendingRef.current = value;
    }
  }, [value]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    commitRef.current(pendingRef.current);
  }, []);

  const change = useCallback(
    (next: T) => {
      setDraft(next);
      pendingRef.current = next;
      dirtyRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        commitRef.current(pendingRef.current);
      }, delay);
    },
    [delay],
  );

  // Closing the panel mid-edit saves what was typed rather than dropping it.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) commitRef.current(pendingRef.current);
    },
    [],
  );

  return [draft, change, flush];
}
