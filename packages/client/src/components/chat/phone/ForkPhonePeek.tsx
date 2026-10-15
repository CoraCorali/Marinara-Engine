// ──────────────────────────────────────────────
// Fork: Pocket Phone — peeking at a character's phone (see FORK.md)
// ──────────────────────────────────────────────
// When the story leaves a character's phone within reach, a "👀 Peek" chip shows under that reply.
// Looking is a story choice: their phone opens read-only (written the first time, then saved), the
// writer is told what you saw, and a line about it goes into your next message when you put it down.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Camera, Eye, Loader2, Palette, Phone, PencilLine } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { DEFAULT_FORK_PHONE_LOOK, type ForkPhoneLook } from "@marinara-engine/shared";
import { markPeekSeen, useForkPhone, usePeek, type PhoneMessage } from "../../../hooks/use-fork-phone";
import { dispatchCardAssetInsert } from "../../../lib/card-asset-links";
import { cn } from "../../../lib/utils";
import { HelpTooltip } from "../../ui/HelpTooltip";
import { Modal } from "../../ui/Modal";
import { ForkPhoneShell } from "./ForkPhoneShell";
import { Avatar, PhoneLook, phoneNameOf, type PhoneCastMember } from "./ForkPhone";

type PeekView = { name: "home" } | { name: "thread"; id: string } | { name: "photos" | "calls" | "drafts" | "look" };

/** The chips under the reply that left a phone within reach. */
export function ForkPhonePeekChips({
  chatId,
  ids,
  cast,
  personaName,
}: {
  chatId: string;
  ids: readonly string[];
  cast: readonly PhoneCastMember[];
  personaName: string;
}) {
  const { t: localizeUi } = useUiTranslation();
  const peek = usePeek(chatId);
  const [open, setOpen] = useState<string | null>(null);
  // The line goes into your next message once, when you put the phone down after a look.
  const told = useRef(new Set<string>());
  const owners = ids.flatMap((id) => cast.filter((member) => member.id === id));
  if (owners.length === 0) return null;

  const close = () => {
    const owner = cast.find((member) => member.id === open);
    if (owner && peek.isSuccess && !told.current.has(owner.id)) {
      told.current.add(owner.id);
      dispatchCardAssetInsert(localizeUi("ui.chat.forkphone.peekLine", { name: owner.name }), chatId);
    }
    setOpen(null);
  };

  return (
    <div className="fork-ui mx-auto my-1 flex w-full max-w-[min(42rem,100%)] flex-wrap items-center gap-1.5 px-2">
      {owners.map((owner) => (
        <button
          key={owner.id}
          type="button"
          onClick={() => {
            setOpen(owner.id);
            peek.mutate(owner.id);
          }}
          className="flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--primary)]/60 bg-[var(--card)] px-3 text-[0.75rem] font-semibold text-foreground"
        >
          <Eye size="0.8125rem" className="text-[var(--primary)]" />
          {localizeUi("ui.chat.forkphone.peekChip", { name: owner.name })}
        </button>
      ))}
      <HelpTooltip
        buttonClassName="-m-2 p-2"
        text={localizeUi("ui.chat.forkphone.peekHelp")}
        side="top"
        wide
        size="0.8125rem"
      />
      <Modal
        open={open !== null}
        onClose={close}
        title={localizeUi("ui.chat.forkphone.peekTitle", {
          name: cast.find((member) => member.id === open)?.name ?? "",
        })}
        width="max-w-md"
        mobileFullscreen
      >
        {open &&
          (peek.isPending ? (
            <div className="flex flex-col items-center gap-2 py-10 text-[0.8125rem] text-foreground/80">
              <Loader2 className="animate-spin text-[var(--primary)]" size="1.25rem" />
              {localizeUi("ui.chat.forkphone.peekUnlocking", {
                name: cast.find((member) => member.id === open)?.name ?? "",
              })}
            </div>
          ) : peek.isError ? (
            <p className="m-0 py-8 text-center text-[0.8125rem] text-foreground/80">
              {localizeUi("ui.chat.forkphone.peekFailed")}
            </p>
          ) : (
            <ForkPhonePeekApp chatId={chatId} ownerId={open} cast={cast} personaName={personaName} />
          ))}
      </Modal>
    </div>
  );
}

/** Their phone, read-only, in the look the AI picked for them (which you can change). */
function ForkPhonePeekApp({
  chatId,
  ownerId,
  cast,
  personaName,
}: {
  chatId: string;
  ownerId: string;
  cast: readonly PhoneCastMember[];
  personaName: string;
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data } = useForkPhone(chatId);
  const [view, setView] = useState<PeekView>({ name: "home" });
  const owner = cast.find((member) => member.id === ownerId);
  const nameOf = phoneNameOf(cast, personaName, data?.names, data?.settings.contacts);
  const look: ForkPhoneLook = { ...DEFAULT_FORK_PHONE_LOOK, ...data?.settings.characterLooks[ownerId] };
  const threads = (data?.threads ?? []).filter((thread) => thread.a === ownerId || thread.b === ownerId);
  const messages = data?.messages ?? [];
  const otherOf = (thread: { a: string; b: string }) => (thread.a === ownerId ? thread.b : thread.a);
  const readable = (message: PhoneMessage) => message.kind === "text" || message.kind === "photo";
  const mine = new Set(threads.map((thread) => thread.id));
  const drafts = messages.filter(
    (message) => message.kind === "draft" && message.sender === ownerId && mine.has(message.threadId),
  );
  const calls = messages.filter((message) => message.kind === "call" && mine.has(message.threadId));
  const photos = data?.written[ownerId]?.photos ?? [];
  const rows = threads
    .map((thread) => ({
      thread,
      last: messages.filter((message) => message.threadId === thread.id && readable(message)).at(-1),
    }))
    .filter((row) => row.last)
    .sort((left, right) => right.last!.createdAt.localeCompare(left.last!.createdAt));

  useEffect(() => {
    // What was opened is what the story is told: a conversation, or the drafts, calls or photos.
    if (view.name === "thread") markPeekSeen(chatId, ownerId, view.id);
    else if (view.name === "drafts" || view.name === "calls" || view.name === "photos") {
      markPeekSeen(chatId, ownerId, view.name);
    }
  }, [chatId, ownerId, view]);

  const back = () => setView({ name: "home" });
  const bar = (title: string, onBack?: () => void) => (
    <div className="fp-bar">
      {onBack && (
        <button type="button" onClick={onBack} aria-label={localizeUi("ui.chat.forkphone.back")}>
          <ArrowLeft size="0.875rem" />
        </button>
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </div>
  );
  const shortcut = (key: "photos" | "calls" | "drafts", icon: ReactNode, count: number) =>
    count > 0 && (
      <button type="button" className="fp-row" onClick={() => setView({ name: key })}>
        {icon}
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">
          {localizeUi(`ui.chat.forkphone.peek.${key}`)}
        </span>
        <span className="text-[0.6875rem] opacity-75">{count}</span>
      </button>
    );

  const screen = (
    <div className="fp-screen">
      {look.skin === "smartphone" && look.wallpaper && (
        <div className="fp-wallpaper" style={{ backgroundImage: `url("${look.wallpaper}")` }} />
      )}
      {view.name === "home" && (
        <>
          <div className="fp-bar">
            <Eye size="0.875rem" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{localizeUi("ui.chat.forkphone.peekBanner")}</span>
            <button
              type="button"
              onClick={() => setView({ name: "look" })}
              aria-label={localizeUi("ui.chat.forkphone.peekLook", { name: owner?.name ?? "" })}
            >
              <Palette size="0.875rem" />
            </button>
          </div>
          <div className="fp-scroll">
            {shortcut("photos", <Camera size="0.875rem" className="shrink-0" />, photos.length)}
            {shortcut("calls", <Phone size="0.875rem" className="shrink-0" />, calls.length)}
            {shortcut("drafts", <PencilLine size="0.875rem" className="shrink-0" />, drafts.length)}
            {rows.length === 0 && (
              <p className="m-0 p-2 text-xs opacity-75">{localizeUi("ui.chat.forkphone.peek.empty")}</p>
            )}
            {rows.map(({ thread, last }) => {
              const other = otherOf(thread);
              return (
                <button
                  key={thread.id}
                  type="button"
                  className="fp-row"
                  onClick={() => setView({ name: "thread", id: thread.id })}
                >
                  <Avatar member={cast.find((member) => member.id === other) ?? { id: other, name: nameOf(other) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-bold">{nameOf(other)}</span>
                    <span className="block truncate text-[0.6875rem] opacity-75">
                      {last!.kind === "photo"
                        ? localizeUi("ui.chat.forkphone.peek.photoText", { about: last!.body })
                        : last!.body}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {view.name === "thread" &&
        (() => {
          const thread = threads.find((entry) => entry.id === view.id);
          const other = thread ? otherOf(thread) : "";
          return (
            <>
              {bar(nameOf(other), back)}
              <div className="fp-scroll">
                {messages
                  .filter((message) => message.threadId === view.id && readable(message))
                  .map((message) => {
                    const theirs = message.sender === ownerId;
                    return (
                      <div key={message.id} className={cn("flex flex-col", theirs ? "items-end" : "items-start")}>
                        <div
                          className={cn(
                            "fp-bubble",
                            theirs ? "is-me" : "is-them",
                            message.kind === "photo" && "italic",
                          )}
                        >
                          {message.kind === "photo"
                            ? localizeUi("ui.chat.forkphone.peek.photoText", { about: message.body })
                            : message.body}
                        </div>
                        {message.storyTime && <span className="fp-time">{message.storyTime}</span>}
                      </div>
                    );
                  })}
              </div>
            </>
          );
        })()}
      {view.name === "photos" && (
        <>
          {bar(localizeUi("ui.chat.forkphone.peek.photos"), back)}
          <div className="fp-scroll">
            {photos.map((photo, index) => (
              <p key={index} className="fp-bubble is-them m-0 italic">
                {localizeUi("ui.chat.forkphone.peek.photoText", { about: photo })}
              </p>
            ))}
          </div>
        </>
      )}
      {view.name === "calls" && (
        <>
          {bar(localizeUi("ui.chat.forkphone.peek.calls"), back)}
          <div className="fp-scroll">
            {calls.map((call) => {
              const thread = threads.find((entry) => entry.id === call.threadId);
              const other = thread ? otherOf(thread) : "";
              const missed = call.body.startsWith("(missed)");
              const about = call.body.replace(/^\(missed\)\s*/, "");
              return (
                <p key={call.id} className="m-0 flex items-baseline gap-2 px-1 text-[0.75rem]">
                  <span className="font-bold">
                    {localizeUi(
                      call.sender === ownerId ? "ui.chat.forkphone.peek.callOut" : "ui.chat.forkphone.peek.callIn",
                      {
                        name: nameOf(other),
                      },
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate opacity-80">
                    {missed ? localizeUi("ui.chat.forkphone.peek.missed", { about }) : about}
                  </span>
                  {call.storyTime && <span className="fp-time">{call.storyTime}</span>}
                </p>
              );
            })}
          </div>
        </>
      )}
      {view.name === "drafts" && (
        <>
          {bar(localizeUi("ui.chat.forkphone.peek.drafts"), back)}
          <div className="fp-scroll">
            {drafts.map((draft) => {
              const thread = threads.find((entry) => entry.id === draft.threadId);
              return (
                <div key={draft.id} className="flex flex-col items-end">
                  <span className="fp-time">
                    {localizeUi("ui.chat.forkphone.peek.draftTo", { name: thread ? nameOf(otherOf(thread)) : "" })}
                  </span>
                  <div className="fp-bubble is-me opacity-75">{draft.body}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {view.name === "look" && <PhoneLook chatId={chatId} look={look} characterId={ownerId} onBack={back} />}
    </div>
  );

  return (
    <div className="fork-ui flex flex-col gap-2 pb-2">
      <ForkPhoneShell
        look={look}
        screen={screen}
        labels={{
          back: localizeUi("ui.chat.forkphone.back"),
          ok: localizeUi("ui.chat.forkphone.back"),
          text: localizeUi("ui.chat.forkphone.textKey"),
          brand: localizeUi("ui.chat.forkphone.brand"),
          clear: localizeUi("ui.chat.forkphone.clearKey"),
          space: localizeUi("ui.chat.forkphone.spaceKey"),
        }}
        onBack={back}
        onOk={back}
      />
    </div>
  );
}
