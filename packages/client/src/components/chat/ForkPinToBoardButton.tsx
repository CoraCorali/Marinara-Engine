// ──────────────────────────────────────────────
// Fork: Pin from chat — put any picture from a roleplay onto its reference board in one tap
// ──────────────────────────────────────────────
import { useMemo, useState } from "react";
import { Loader2, Images } from "lucide-react";
import { toast } from "sonner";
import { useTranslation as useUiTranslation } from "react-i18next";
import { useChatStore } from "../../stores/chat.store";
import { useChat } from "../../hooks/use-chats";
import { useAddBoardPin, type BoardScope } from "../../hooks/use-fork-board";

/**
 * Sits in the image viewer beside Marinara's own buttons. The picture is fetched as the browser
 * already has it and uploaded like any pinned picture, so it shares the board's size and type limits.
 */
export function ForkPinToBoardButton({ url }: { url: string }) {
  const { t: localizeUi } = useUiTranslation();
  const chatId = useChatStore((s) => s.activeChatId);
  const { data: chat } = useChat(chatId);
  const scope = useMemo<BoardScope>(() => (chatId ? { scopeType: "chat", scopeId: chatId } : null), [chatId]);
  const addPin = useAddBoardPin(scope);
  const [pinning, setPinning] = useState(false);
  if (!chatId || chat?.mode !== "roleplay" || !url) return null;

  const pin = async () => {
    if (pinning) return;
    setPinning(true);
    try {
      // Reading the picture fails with a bare status code or a browser network message; neither
      // means anything to the reader, so that half always gets the plain message.
      let blob: Blob;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        blob = await response.blob();
      } catch {
        toast.error(localizeUi("ui.chat.forkboard.couldNotPinThatPicture"));
        return;
      }
      const type = blob.type.startsWith("image/") ? blob.type : "image/png";
      const extension = type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png";
      await addPin.mutateAsync({ file: new File([blob], `pinned.${extension}`, { type }) });
      toast.success(localizeUi("ui.chat.forkboard.pinnedFromChat"));
    } catch (error) {
      // The upload's own message says what was wrong (too big, wrong type).
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : localizeUi("ui.chat.forkboard.couldNotPinThatPicture"),
      );
    } finally {
      setPinning(false);
    }
  };

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void pin();
      }}
      disabled={pinning}
      aria-label={localizeUi("ui.chat.forkboard.pinToBoard")}
      title={localizeUi("ui.chat.forkboard.pinToBoard")}
      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-black/60 px-3 text-xs font-semibold text-white transition-colors hover:bg-black/80 disabled:opacity-60"
    >
      {pinning ? <Loader2 size="0.875rem" className="animate-spin" /> : <Images size="0.875rem" />}
      <span>{localizeUi("ui.chat.forkboard.board")}</span>
    </button>
  );
}
