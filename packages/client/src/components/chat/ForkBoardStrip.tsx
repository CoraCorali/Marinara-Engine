// ──────────────────────────────────────────────
// Fork: the in-scene strip above the message box
// ──────────────────────────────────────────────
import { Images, HeartHandshake } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { useBoardPins, type BoardScope } from "../../hooks/use-fork-board";

interface Props {
  chatScope: BoardScope;
  personaScope: BoardScope;
  onOpenBoard: () => void;
  onOpenBonds: () => void;
}

/**
 * A small row of the pictures the AI is seeing right now, with a button to open the board.
 * Persona pins come first, since they hold across every scene.
 */
export function ForkBoardStrip({ chatScope, personaScope, onOpenBoard, onOpenBonds }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const { data: chatPins } = useBoardPins(chatScope);
  const { data: personaPins } = useBoardPins(personaScope);
  const pins = [...(personaPins ?? []), ...(chatPins ?? [])].filter((pin) => pin.inScene);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {localizeUi("ui.chat.forkboard.inScene")}
      </span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {pins.slice(0, 12).map((pin) => (
          <img
            key={pin.id}
            src={pin.imagePath}
            alt={pin.caption || localizeUi("ui.chat.forkboard.referencePicture")}
            title={pin.caption}
            className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-[var(--border)]"
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onOpenBoard}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-foreground/60 hover:bg-foreground/10 hover:text-foreground/90"
        title={localizeUi("ui.chat.forkboard.title")}
      >
        <Images size="0.875rem" />
        {localizeUi("ui.chat.forkboard.board")}
      </button>
      <button
        type="button"
        onClick={onOpenBonds}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-foreground/60 hover:bg-foreground/10 hover:text-foreground/90"
        title={localizeUi("ui.chat.forkbonds.title")}
      >
        <HeartHandshake size="0.875rem" />
        {localizeUi("ui.chat.forkbonds.people")}
      </button>
    </div>
  );
}
