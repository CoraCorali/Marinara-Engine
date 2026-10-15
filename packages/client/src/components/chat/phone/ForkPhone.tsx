// ──────────────────────────────────────────────
// Fork: Pocket Phone — your phone in a roleplay (see FORK.md)
// ──────────────────────────────────────────────
// The 📱 pill opens your phone: a thread per card character, each a texting app inside the skin
// you picked. What you text sits in the chat after the newest message, and the story's writer is
// told about it. Off by default; switched on per chat, since a fantasy story has no phones.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Palette, SendHorizontal, Smartphone, Trash2 } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import {
  DEFAULT_FORK_PHONE_LOOK,
  FORK_PHONE_COLORS,
  FORK_PHONE_SKINS,
  type ForkPhoneLook,
  type ForkPhoneSkin,
} from "@marinara-engine/shared";
import {
  PHONE_PERSONA,
  otherSide,
  unreadCount,
  useDeleteText,
  useForkPhone,
  useMarkThreadRead,
  useSendText,
  useUpdatePhoneSettings,
  type PhoneMessage,
  type PhoneThread,
} from "../../../hooks/use-fork-phone";
import { useBoardPins } from "../../../hooks/use-fork-board";
import { FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS } from "../../../lib/fork/bar-pill";
import { FORK_SWITCH_CLASS } from "../../../lib/fork/switch";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { cn } from "../../../lib/utils";
import { HelpTooltip } from "../../ui/HelpTooltip";
import { Modal } from "../../ui/Modal";
import { ForkPhoneShell } from "./ForkPhoneShell";
import { useForkPhoneStore } from "../../../stores/fork-phone.store";

export type PhoneCastMember = { id: string; name: string; avatarUrl?: string | null };

const CHIP =
  "flex min-h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors";
const CHIP_ON = "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]";
const CHIP_OFF = "border-[var(--border)] text-foreground/85 hover:bg-foreground/10";

type View = { name: "home" } | { name: "thread"; to: string } | { name: "look" };

function Avatar({ member }: { member?: PhoneCastMember }) {
  if (member?.avatarUrl) return <img className="fp-avatar" src={member.avatarUrl} alt="" draggable={false} />;
  return <span className="fp-avatar">{(member?.name ?? "?").slice(0, 1).toUpperCase()}</span>;
}

/** The 📱 pill: opens your phone, or explains it and switches it on for this chat. */
export function ForkPhonePill({
  chatId,
  cast,
  personaName,
}: {
  chatId: string;
  cast: readonly PhoneCastMember[];
  personaName: string;
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data } = useForkPhone(chatId);
  // In a store, so a text card in the chat can open the phone on its conversation.
  const openTo = useForkPhoneStore((s) => s.openTo);
  const setOpenTo = useForkPhoneStore((s) => s.setOpenTo);
  const open = openTo !== null;
  const setOpen = (next: boolean) => setOpenTo(next ? "home" : null);
  const on = data?.settings.on === true;
  const unread = on ? unreadCount(data) : 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS, "relative", !on && "opacity-70")}
        title={localizeUi(on ? "ui.chat.forkphone.pillTitle" : "ui.chat.forkphone.pillOffTitle")}
      >
        <Smartphone size="0.875rem" />
        <span>{localizeUi("ui.chat.forkphone.pill")}</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[0.625rem] font-bold text-[var(--primary-foreground)]">
            {unread}
          </span>
        )}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={localizeUi("ui.chat.forkphone.title")}
        width="max-w-md"
        mobileFullscreen
      >
        {open && (
          <ForkPhoneSheet
            chatId={chatId}
            cast={cast}
            personaName={personaName}
            startWith={openTo && openTo !== "home" ? openTo : undefined}
          />
        )}
      </Modal>
    </>
  );
}

function ForkPhoneSheet({
  chatId,
  cast,
  personaName,
  startWith,
}: {
  chatId: string;
  cast: readonly PhoneCastMember[];
  personaName: string;
  startWith?: string;
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data, isLoading } = useForkPhone(chatId);
  const update = useUpdatePhoneSettings(chatId);
  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-[var(--muted-foreground)]" size="1.25rem" />
      </div>
    );
  }
  if (!data.settings.on) {
    return (
      <div className="fork-ui flex flex-col items-center gap-3 py-4 text-center text-[0.8125rem]">
        <Smartphone size="2rem" className="text-[var(--primary)]" />
        <p className="m-0 max-w-[22rem] text-foreground/85">{localizeUi("ui.chat.forkphone.offBody")}</p>
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => update.mutate({ on: true })}
          className="flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 text-[0.8125rem] font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {update.isPending ? <Loader2 size="0.875rem" className="animate-spin" /> : <Smartphone size="0.875rem" />}
          {localizeUi("ui.chat.forkphone.turnOn")}
        </button>
      </div>
    );
  }
  return <ForkPhoneApp chatId={chatId} cast={cast} personaName={personaName} startWith={startWith} />;
}

export function ForkPhoneApp({
  chatId,
  cast,
  personaName,
  startWith,
}: {
  chatId: string;
  cast: readonly PhoneCastMember[];
  personaName: string;
  /** Open straight on one thread (a text card in the chat was tapped). */
  startWith?: string;
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data } = useForkPhone(chatId);
  const [view, setView] = useState<View>(startWith ? { name: "thread", to: startWith } : { name: "home" });
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const send = useSendText(chatId);
  const look: ForkPhoneLook = data?.settings ?? DEFAULT_FORK_PHONE_LOOK;

  const threadFor = (to: string): PhoneThread | undefined =>
    data?.threads.find(
      (thread) => (thread.a === PHONE_PERSONA && thread.b === to) || (thread.b === PHONE_PERSONA && thread.a === to),
    );
  const sendDraft = () => {
    if (view.name !== "thread" || !draft.trim() || send.isPending) return;
    send.mutate({ to: view.to, body: draft }, { onSuccess: () => setDraft("") });
  };

  const screen = (
    <div className="fp-screen">
      {look.skin === "smartphone" && look.wallpaper && (
        <div className="fp-wallpaper" style={{ backgroundImage: `url("${look.wallpaper}")` }} />
      )}
      {view.name === "home" && (
        <PhoneHome
          cast={cast}
          messages={data?.messages ?? []}
          threadFor={threadFor}
          onOpen={(to) => setView({ name: "thread", to })}
          onLook={() => setView({ name: "look" })}
        />
      )}
      {view.name === "thread" && (
        <PhoneThreadView
          chatId={chatId}
          to={view.to}
          member={cast.find((member) => member.id === view.to)}
          personaName={personaName}
          thread={threadFor(view.to)}
          messages={data?.messages ?? []}
          draft={draft}
          onDraft={setDraft}
          onTyping={setTyping}
          onSend={sendDraft}
          sending={send.isPending}
          onBack={() => setView({ name: "home" })}
        />
      )}
      {view.name === "look" && <PhoneLook chatId={chatId} look={look} onBack={() => setView({ name: "home" })} />}
    </div>
  );

  return (
    <div className="fork-ui flex flex-col gap-2 pb-2">
      <ForkPhoneShell
        look={look}
        screen={screen}
        typing={typing || draft.length > 0}
        labels={{
          back: localizeUi("ui.chat.forkphone.back"),
          ok: localizeUi("ui.chat.forkphone.send"),
          text: localizeUi("ui.chat.forkphone.textKey"),
          brand: localizeUi("ui.chat.forkphone.brand"),
          clear: localizeUi("ui.chat.forkphone.clearKey"),
          space: localizeUi("ui.chat.forkphone.spaceKey"),
        }}
        onBack={() => setView({ name: "home" })}
        onOk={() => (view.name === "thread" ? sendDraft() : undefined)}
        onKey={(key) => {
          if (view.name !== "thread") return;
          if (key === "\n") return sendDraft();
          setDraft((current) => (key === "⌫" ? current.slice(0, -1) : current + key));
        }}
      />
    </div>
  );
}

function PhoneHome({
  cast,
  messages,
  threadFor,
  onOpen,
  onLook,
}: {
  cast: readonly PhoneCastMember[];
  messages: readonly PhoneMessage[];
  threadFor: (to: string) => PhoneThread | undefined;
  onOpen: (to: string) => void;
  onLook: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const rows = cast
    .map((member) => {
      const thread = threadFor(member.id);
      const own = thread ? messages.filter((message) => message.threadId === thread.id) : [];
      const last = [...own].reverse().find((message) => message.kind === "text" || message.kind === "photo");
      const unread = own.filter((message) => !message.read && message.sender !== PHONE_PERSONA).length;
      return { member, last, unread, at: last?.createdAt ?? "" };
    })
    // Newest conversation first; people you have not texted keep the cast's order after them.
    .sort((left, right) => right.at.localeCompare(left.at));
  return (
    <>
      <div className="fp-bar">
        <span className="flex-1">{localizeUi("ui.chat.forkphone.messages")}</span>
        <button type="button" onClick={onLook} aria-label={localizeUi("ui.chat.forkphone.look")}>
          <Palette size="0.875rem" />
        </button>
      </div>
      <div className="fp-scroll">
        {rows.length === 0 && (
          <p className="m-0 p-2 text-xs opacity-75">{localizeUi("ui.chat.forkphone.noContacts")}</p>
        )}
        {rows.map(({ member, last, unread }) => (
          <button key={member.id} type="button" className="fp-row" onClick={() => onOpen(member.id)}>
            <Avatar member={member} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-bold">{member.name}</span>
              <span className="block truncate text-[0.6875rem] opacity-75">
                {last ? last.body : localizeUi("ui.chat.forkphone.sayHi")}
              </span>
            </span>
            {unread > 0 && <span className="fp-unread" aria-label={localizeUi("ui.chat.forkphone.unread")} />}
          </button>
        ))}
      </div>
    </>
  );
}

function PhoneThreadView({
  chatId,
  to,
  member,
  personaName,
  thread,
  messages,
  draft,
  onDraft,
  onTyping,
  onSend,
  sending,
  onBack,
}: {
  chatId: string;
  to: string;
  member?: PhoneCastMember;
  personaName: string;
  thread?: PhoneThread;
  messages: readonly PhoneMessage[];
  draft: string;
  onDraft: (value: string) => void;
  onTyping: (typing: boolean) => void;
  onSend: () => void;
  sending: boolean;
  onBack: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const markRead = useMarkThreadRead(chatId);
  const remove = useDeleteText(chatId);
  const endRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(
    () => (thread ? messages.filter((message) => message.threadId === thread.id && message.kind !== "draft") : []),
    [messages, thread],
  );
  const unread = shown.some((message) => !message.read && message.sender !== PHONE_PERSONA);
  useEffect(() => {
    if (thread && unread) markRead.mutate(thread.id);
    // Only when something unread shows up, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, unread]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length]);

  const removeText = async (message: PhoneMessage) => {
    if (
      !(await showConfirmDialog({
        title: localizeUi("ui.chat.forkphone.deleteText"),
        message: localizeUi("ui.chat.forkphone.deleteTextBody"),
        confirmLabel: localizeUi("ui.chat.forkphone.delete"),
        chatStyle: true,
      }))
    )
      return;
    remove.mutate(message.id);
  };

  return (
    <>
      <div className="fp-bar">
        <button type="button" onClick={onBack} aria-label={localizeUi("ui.chat.forkphone.back")}>
          <ArrowLeft size="0.875rem" />
        </button>
        <Avatar member={member} />
        <span className="min-w-0 flex-1 truncate">{member?.name ?? to}</span>
      </div>
      <div className="fp-scroll">
        {shown.length === 0 && (
          <p className="m-0 p-2 text-center text-xs opacity-75">
            {localizeUi("ui.chat.forkphone.emptyThread", { name: member?.name ?? to })}
          </p>
        )}
        {shown.map((message) => {
          const mine = message.sender === PHONE_PERSONA;
          if (message.kind === "call" || message.kind === "call_line") {
            return (
              <p key={message.id} className="m-0 self-center text-[0.6875rem] opacity-75">
                📞 {message.body}
              </p>
            );
          }
          return (
            <div key={message.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div className={cn("fp-bubble", mine ? "is-me" : "is-them")}>{message.body}</div>
              <span className="fp-time flex items-center gap-1">
                {message.storyTime || ""}
                {mine && (
                  <button
                    type="button"
                    onClick={() => void removeText(message)}
                    aria-label={localizeUi("ui.chat.forkphone.deleteText")}
                    className="flex h-8 w-8 items-center justify-center opacity-80"
                  >
                    <Trash2 size="0.6875rem" />
                  </button>
                )}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="fp-compose">
        <label className="sr-only" htmlFor="fork-phone-draft">
          {localizeUi("ui.chat.forkphone.writeTo", { name: member?.name ?? to, me: personaName })}
        </label>
        <textarea
          id="fork-phone-draft"
          rows={1}
          value={draft}
          placeholder={localizeUi("ui.chat.forkphone.placeholder")}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSend();
            }
          }}
          className="fork-keep-size"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!draft.trim() || sending}
          aria-label={localizeUi("ui.chat.forkphone.send")}
        >
          {sending ? <Loader2 size="0.875rem" className="animate-spin" /> : <SendHorizontal size="0.875rem" />}
        </button>
      </div>
    </>
  );
}

const SKIN_LABEL_KEYS: Record<ForkPhoneSkin, string> = {
  slider: "ui.chat.forkphone.skin.slider",
  candybar: "ui.chat.forkphone.skin.candybar",
  smartphone: "ui.chat.forkphone.skin.smartphone",
};

function PhoneLook({ chatId, look, onBack }: { chatId: string; look: ForkPhoneLook; onBack: () => void }) {
  const { t: localizeUi } = useUiTranslation();
  const update = useUpdatePhoneSettings(chatId);
  const { data: pins } = useBoardPins({ scopeType: "chat", scopeId: chatId });
  const set = (patch: Partial<ForkPhoneLook> & { on?: boolean }) => update.mutate(patch);
  // The settings sit on the phone's own screen, so they use the page's colours on a card.
  return (
    <>
      <div className="fp-bar">
        <button type="button" onClick={onBack} aria-label={localizeUi("ui.chat.forkphone.back")}>
          <ArrowLeft size="0.875rem" />
        </button>
        <span className="flex-1">{localizeUi("ui.chat.forkphone.look")}</span>
        <HelpTooltip
          buttonClassName="-m-2 p-2"
          text={localizeUi("ui.chat.forkphone.lookHelp")}
          side="bottom"
          wide
          size="0.8125rem"
        />
      </div>
      <div className="fp-scroll">
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--card)] p-2 text-[0.75rem] text-foreground">
          <p className="m-0 font-bold">{localizeUi("ui.chat.forkphone.skin")}</p>
          <div className="flex flex-wrap gap-1.5">
            {FORK_PHONE_SKINS.map((skin) => (
              <button
                key={skin}
                type="button"
                onClick={() => set({ skin })}
                aria-pressed={look.skin === skin}
                className={cn(CHIP, look.skin === skin ? CHIP_ON : CHIP_OFF)}
              >
                {localizeUi(SKIN_LABEL_KEYS[skin])}
              </button>
            ))}
          </div>
          <p className="m-0 font-bold">{localizeUi("ui.chat.forkphone.colour")}</p>
          <div className="flex flex-wrap gap-1.5">
            {FORK_PHONE_COLORS[look.skin].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => set({ color })}
                aria-pressed={look.color === color}
                className={cn(CHIP, look.color === color ? CHIP_ON : CHIP_OFF)}
              >
                {localizeUi(
                  `ui.chat.forkphone.color.${color.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())}`,
                )}
              </button>
            ))}
          </div>
          {look.skin === "candybar" && (
            <div className="flex flex-wrap gap-1.5">
              {(["qwerty", "number"] as const).map((keys) => (
                <button
                  key={keys}
                  type="button"
                  onClick={() => set({ keys })}
                  aria-pressed={look.keys === keys}
                  className={cn(CHIP, look.keys === keys ? CHIP_ON : CHIP_OFF)}
                >
                  {localizeUi(`ui.chat.forkphone.keys.${keys}`)}
                </button>
              ))}
            </div>
          )}
          {(
            [
              ["gems", "ui.chat.forkphone.gems"],
              ["dotMatrix", "ui.chat.forkphone.dotMatrix"],
              ...(look.skin === "candybar" ? ([["stickers", "ui.chat.forkphone.stickers"]] as const) : []),
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-9 items-center justify-between gap-3 rounded-xl bg-[var(--secondary)] px-3 font-semibold"
            >
              {localizeUi(label)}
              <input
                type="checkbox"
                role="switch"
                checked={look[key]}
                onChange={(event) => set({ [key]: event.target.checked })}
                className={FORK_SWITCH_CLASS}
              />
            </label>
          ))}
          {look.skin === "smartphone" && (
            <>
              <p className="m-0 font-bold">{localizeUi("ui.chat.forkphone.wallpaper")}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => set({ wallpaper: "" })}
                  aria-pressed={!look.wallpaper}
                  className={cn(CHIP, !look.wallpaper ? CHIP_ON : CHIP_OFF)}
                >
                  {localizeUi("ui.chat.forkphone.noWallpaper")}
                </button>
                {(pins ?? []).slice(0, 12).map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => set({ wallpaper: pin.imagePath })}
                    aria-pressed={look.wallpaper === pin.imagePath}
                    aria-label={pin.name || pin.caption || localizeUi("ui.chat.forkphone.wallpaper")}
                    className={cn(
                      "h-10 w-10 overflow-hidden rounded-lg ring-2",
                      look.wallpaper === pin.imagePath ? "ring-[var(--primary)]" : "ring-transparent",
                    )}
                  >
                    <img src={pin.imagePath} alt="" className="h-full w-full object-cover" draggable={false} />
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => set({ on: false })}
            className="mt-1 flex min-h-9 items-center justify-center rounded-xl border border-[var(--border)] font-semibold text-foreground/80"
          >
            {localizeUi("ui.chat.forkphone.turnOff")}
          </button>
        </div>
      </div>
    </>
  );
}

/** Texts and calls between the prose: a little card after the story message they followed. */
export function ForkPhoneInlineCards({
  messages,
  threads,
  cast,
  personaName,
  onOpen,
}: {
  messages: readonly PhoneMessage[];
  threads: readonly PhoneThread[];
  cast: readonly PhoneCastMember[];
  personaName: string;
  onOpen: (to: string) => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const nameOf = (side: string) =>
    side === PHONE_PERSONA
      ? personaName
      : (cast.find((member) => member.id === side)?.name ?? side.replace(/^contact:/, ""));
  return (
    <div className="mx-auto my-1 flex w-full max-w-[min(42rem,100%)] flex-col gap-1 px-2">
      {messages.map((message) => {
        const thread = threads.find((entry) => entry.id === message.threadId);
        if (!thread) return null;
        const other = otherSide(thread);
        const mine = message.sender === PHONE_PERSONA;
        return (
          <button
            key={message.id}
            type="button"
            onClick={() => onOpen(other)}
            className={cn(
              "flex max-w-[85%] items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-left text-[0.75rem]",
              mine ? "self-end" : "self-start",
            )}
            aria-label={localizeUi("ui.chat.forkphone.openThread", { name: nameOf(other) })}
          >
            <Smartphone size="0.75rem" className="shrink-0 text-[var(--primary)]" />
            <span className="min-w-0">
              <span className="font-bold">
                {message.kind === "call"
                  ? localizeUi("ui.chat.forkphone.callCard", { name: nameOf(message.sender) })
                  : localizeUi("ui.chat.forkphone.textCard", {
                      from: nameOf(message.sender),
                      to: nameOf(mine ? other : PHONE_PERSONA),
                    })}
              </span>{" "}
              <span className="text-foreground/85">{message.body}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
