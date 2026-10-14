// ──────────────────────────────────────────────
// Fork: the board, people and slop pills that lead the row above the message box
// ──────────────────────────────────────────────
import { useState } from "react";
import { CloudSun, Images, HeartHandshake, Highlighter } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { useBoardPins, type BoardScope } from "../../hooks/use-fork-board";
import { FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS } from "../../lib/fork/bar-pill";
import { cn } from "../../lib/utils";
import { useForkSlopStore } from "../../stores/fork-slop.store";
import { Modal } from "../ui/Modal";
import { ForkWeatherPanel } from "./ForkWeatherPanel";

interface Props {
  chatScope: BoardScope;
  personaScope: BoardScope;
  onOpenBoard: () => void;
  onOpenBonds: () => void;
}

/**
 * The Board pill carries a stack of the pictures the AI is seeing right now, so what is in scene
 * stays visible without a row of its own. Persona pins come first, since they hold across every scene.
 */
export function ForkBoardStrip({ chatScope, personaScope, onOpenBoard, onOpenBonds }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const { data: chatPins } = useBoardPins(chatScope);
  const { data: personaPins } = useBoardPins(personaScope);
  const openSlopList = useForkSlopStore((s) => s.setListOpen);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const pins = [...(personaPins ?? []), ...(chatPins ?? [])].filter((pin) => pin.inScene);
  const shown = pins.slice(0, 3);
  const boardLabel = pins.length
    ? localizeUi("ui.chat.forkboard.boardInScene", { count: pins.length })
    : localizeUi("ui.chat.forkboard.title");

  return (
    <>
      <button
        type="button"
        onClick={onOpenBoard}
        className={cn(FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS, shown.length > 0 && "pl-1.5")}
        title={boardLabel}
        aria-label={boardLabel}
      >
        {shown.length > 0 ? (
          <span className="flex" aria-hidden="true">
            {shown.map((pin, index) => (
              <img
                key={pin.id}
                src={pin.imagePath}
                alt=""
                className={cn("h-8 w-8 rounded-full object-cover ring-2 ring-[var(--card)]", index > 0 && "-ml-3")}
              />
            ))}
          </span>
        ) : (
          <Images size="0.875rem" />
        )}
        <span>{localizeUi("ui.chat.forkboard.board")}</span>
      </button>
      <button
        type="button"
        onClick={onOpenBonds}
        className={cn(FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS)}
        title={localizeUi("ui.chat.forkbonds.title")}
      >
        <HeartHandshake size="0.875rem" />
        <span>{localizeUi("ui.chat.forkbonds.people")}</span>
      </button>
      <button
        type="button"
        onClick={() => setWeatherOpen(true)}
        className={cn(FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS)}
        title={localizeUi("ui.chat.forkweather.title")}
      >
        <CloudSun size="0.875rem" />
        <span>{localizeUi("ui.chat.forkweather.button")}</span>
      </button>
      <Modal
        open={weatherOpen}
        onClose={() => setWeatherOpen(false)}
        title={localizeUi("ui.chat.forkweather.title")}
        width="max-w-md"
        mobileFullscreen
      >
        <ForkWeatherPanel chatId={chatScope?.scopeId ?? null} />
      </Modal>
      <button
        type="button"
        onClick={() => openSlopList(true)}
        className={cn(FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS, "order-last w-11 justify-center px-0")}
        title={localizeUi("ui.chat.forkfix.slopListTitle")}
        aria-label={localizeUi("ui.chat.forkfix.slopListTitle")}
      >
        <Highlighter size="0.875rem" />
      </button>
    </>
  );
}
