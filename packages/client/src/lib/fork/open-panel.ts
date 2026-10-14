// ──────────────────────────────────────────────
// Fork: open the board or People from anywhere (see FORK.md)
// ──────────────────────────────────────────────
// The tracker panel lives outside the chat area that owns those dialogs, so a line on the persona
// card asks for one with a window event and the chat area opens it.

export type ForkPanel = "board" | "people";

const EVENT = "marinara:fork-open-panel";

export function openForkPanel(panel: ForkPanel): void {
  window.dispatchEvent(new CustomEvent<ForkPanel>(EVENT, { detail: panel }));
}

/** Listens for openForkPanel; returns the cleanup. */
export function onForkPanelRequest(handler: (panel: ForkPanel) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<ForkPanel>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
