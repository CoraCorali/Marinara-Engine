// ──────────────────────────────────────────────
// Fork: the board's outfits and the tracker's "Wearing" lines agree (see FORK.md)
// ──────────────────────────────────────────────
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation as useUiTranslation } from "react-i18next";
import type { PresentCharacter } from "@marinara-engine/shared";
import { outfitLineFromPins, outfitStillMatches } from "../../lib/fork/outfit";
import { useBoardPins, useUpdateBoardPin, type BoardPin, type BoardScope } from "../../hooks/use-fork-board";
import { patchGameStateField } from "../../hooks/use-game-state-patcher";
import { useGameStateStore } from "../../stores/game-state.store";

function wornBy(pins: readonly BoardPin[] | undefined, characterId: string): BoardPin[] {
  return (pins ?? []).filter(
    (pin) => pin.inScene && pin.category === "wearing" && pin.who === characterId && pin.caption.trim(),
  );
}

/**
 * Renders nothing. Two directions:
 * - When you change a character's outfit pins, their tracker "Wearing" line becomes those captions.
 * - When the tracker writes an outfit that no longer matches their pins (they changed clothes in the
 *   story), Marinara asks before taking the pins out of the scene, rather than deciding for you.
 */
export function ForkOutfitSync({ chatId, scope }: { chatId: string | null; scope: BoardScope }) {
  const { t: localizeUi } = useUiTranslation();
  const { data: pins } = useBoardPins(scope);
  const updatePin = useUpdateBoardPin(scope);
  const takeOutRef = useRef(updatePin.mutate);
  takeOutRef.current = updatePin.mutate;
  const present = useGameStateStore((state) =>
    state.current && state.current.chatId === chatId ? state.current.presentCharacters : null,
  );
  // What the board last said for each character, and the tracker line last seen for each.
  const pinLines = useRef(new Map<string, string>());
  const trackerLines = useRef(new Map<string, string>());
  const ready = useRef(false);

  useEffect(() => {
    pinLines.current.clear();
    trackerLines.current.clear();
    ready.current = false;
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !pins || !present) return;
    const writeOutfit = (characterId: string, outfit: string) => {
      // Read the store now, not the snapshot this pass started from: an earlier write in the same
      // pass, or a toast answered later, must not put back what has changed since.
      const latest = useGameStateStore.getState().current;
      const base = latest && latest.chatId === chatId ? latest.presentCharacters : present;
      const next = ((base ?? []) as PresentCharacter[]).map((character) =>
        character.characterId === characterId ? { ...character, outfit } : character,
      );
      trackerLines.current.set(characterId, outfit);
      patchGameStateField(chatId, "presentCharacters", next);
    };

    for (const character of present as PresentCharacter[]) {
      const id = character.characterId;
      if (!id) continue;
      const worn = wornBy(pins, id);
      const pinLine = outfitLineFromPins(worn);
      const trackerLine = (character.outfit ?? "").trim();
      const previousPinLine = pinLines.current.get(id);
      const previousTrackerLine = trackerLines.current.get(id);
      pinLines.current.set(id, pinLine);

      // First look at this chat: remember where things stand without changing anything.
      if (!ready.current) {
        trackerLines.current.set(id, trackerLine);
        continue;
      }
      // You changed the pins: the tracker follows.
      if (pinLine && pinLine !== previousPinLine && pinLine !== trackerLine) {
        writeOutfit(id, pinLine);
        continue;
      }
      // The story changed the clothes: ask before the pins step out.
      if (trackerLine !== previousTrackerLine) {
        trackerLines.current.set(id, trackerLine);
        if (!trackerLine || worn.length === 0 || outfitStillMatches(trackerLine, worn)) continue;
        toast(localizeUi("ui.chat.forkboard.outfitChangedTitle", { name: character.name }), {
          id: `fork-outfit-${id}`,
          description: localizeUi("ui.chat.forkboard.outfitChangedBody", { outfit: trackerLine }),
          duration: 20_000,
          action: {
            label: localizeUi("ui.chat.forkboard.outfitTakeOut"),
            onClick: () => {
              for (const pin of worn) takeOutRef.current({ id: pin.id, inScene: false });
            },
          },
          cancel: {
            label: localizeUi("ui.chat.forkboard.outfitKeepPins"),
            onClick: () => writeOutfit(id, outfitLineFromPins(worn)),
          },
        });
      }
    }
    ready.current = true;
  }, [chatId, localizeUi, pins, present]);

  return null;
}
