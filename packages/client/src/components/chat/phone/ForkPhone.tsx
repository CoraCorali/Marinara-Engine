// ──────────────────────────────────────────────
// Fork: Pocket Phone — your phone in a roleplay (see FORK.md)
// ──────────────────────────────────────────────
// The 📱 pill opens your phone: a thread per card character, each a texting app inside the skin
// you picked. What you text sits in the chat after the newest message, and the story's writer is
// told about it. Off by default; switched on per chat, since a fantasy story has no phones.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Palette,
  PencilLine,
  Phone,
  PhoneOff,
  SendHorizontal,
  Smartphone,
  Trash2,
  Eraser,
  UserPlus,
} from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import {
  DEFAULT_FORK_PHONE_LOOK,
  FORK_PHONE_COLORS,
  FORK_PHONE_RELATIONS,
  FORK_PHONE_SKINS,
  type ForkPhoneContact,
  type ForkPhoneRelation,
  type ForkPhoneLook,
  type ForkPhoneSkin,
} from "@marinara-engine/shared";
import {
  PHONE_CONTACT,
  PHONE_PERSONA,
  PHONE_UNKNOWN,
  callMinutes,
  useTextReply,
  useContacts,
  deliverIdlePhone,
  otherSide,
  phoneNames,
  unreadCount,
  useCallAction,
  useClearThread,
  useDeleteText,
  useForkPhone,
  useMarkThreadRead,
  useSwipeText,
  useSendText,
  useUpdatePhoneSettings,
  type PhoneCall,
  type PhoneMessage,
  type PhoneThread,
} from "../../../hooks/use-fork-phone";
import { useBoardPins } from "../../../hooks/use-fork-board";
import { FORK_BAR_PILL_CLASS, FORK_BAR_PILL_IDLE_CLASS } from "../../../lib/fork/bar-pill";
import { FORK_SWITCH_CLASS } from "../../../lib/fork/switch";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { cn } from "../../../lib/utils";
import { translate } from "../../../localization/i18n";
import { playPhonePing } from "../../../lib/fork/phone-ping";
import { HelpTooltip } from "../../ui/HelpTooltip";
import { Modal } from "../../ui/Modal";
import { ForkPhoneShell } from "./ForkPhoneShell";
import { PhoneBubble, PhoneEditPanel, PhoneFixPanel, SwipeRow, swipeText } from "./ForkPhoneTexts";
import { useForkPhoneStore } from "../../../stores/fork-phone.store";

export type PhoneCastMember = { id: string; name: string; avatarUrl?: string | null };

const CHIP =
  "flex min-h-8 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors";
const CHIP_ON = "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]";
const CHIP_OFF = "border-[var(--border)] text-foreground/85 hover:bg-foreground/10";

type View =
  | { name: "home" }
  | { name: "thread"; to: string }
  | { name: "look" }
  | { name: "call" }
  /** A new contact (maybe saving an unknown number), or changing one (by name). */
  | { name: "contact"; edit?: string; from?: string };

/**
 * Texts waiting to arrive come in after this long in the chat without writing.
 * ponytail: only a keypress counts as writing; scrolling or reading does not restart the wait.
 */
const IDLE_DELIVERY_MS = 3 * 60_000;

export function Avatar({ member }: { member?: PhoneCastMember }) {
  if (member?.avatarUrl) return <img className="fp-avatar" src={member.avatarUrl} alt="" draggable={false} />;
  return <span className="fp-avatar">{(member?.name ?? "?").slice(0, 1).toUpperCase()}</span>;
}

/** The 📱 pill: opens your phone, or explains it and switches it on for this chat. */
export function ForkPhonePill({
  chatId,
  cast,
  personaName,
  busy = false,
}: {
  chatId: string;
  cast: readonly PhoneCastMember[];
  personaName: string;
  /** A reply is being written: nothing arrives while you wait for it. */
  busy?: boolean;
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data } = useForkPhone(chatId);
  const qc = useQueryClient();
  const nameOf = useMemo(() => phoneNameOf(cast, personaName, data?.names), [cast, personaName, data?.names]);
  useEffect(() => {
    phoneNames.set(chatId, nameOf);
  }, [chatId, nameOf]);
  // Waiting texts arrive when you sit in the chat a few minutes without writing.
  const waiting = data?.settings.on ? (data.waiting ?? 0) : 0;
  useEffect(() => {
    if (!waiting || busy) return;
    let timer = window.setTimeout(() => deliverIdlePhone(qc, chatId), IDLE_DELIVERY_MS);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => deliverIdlePhone(qc, chatId), IDLE_DELIVERY_MS);
    };
    window.addEventListener("keydown", restart);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", restart);
    };
  }, [busy, chatId, qc, waiting]);
  // A ping for each new text or call on your phone; what was there when the chat opened stays quiet.
  const heard = useRef<{ chatId: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!data) return;
    const mine = new Set(
      data.threads
        .filter((thread) => thread.a === PHONE_PERSONA || thread.b === PHONE_PERSONA)
        .map((thread) => thread.id),
    );
    const incoming = data.messages
      .filter(
        (message) =>
          mine.has(message.threadId) &&
          !message.read &&
          message.sender !== PHONE_PERSONA &&
          message.kind !== "call_line" &&
          message.kind !== "draft",
      )
      .map((message) => message.id);
    if (heard.current?.chatId !== chatId) {
      heard.current = { chatId, ids: new Set(incoming) };
      return;
    }
    const known = heard.current.ids;
    const fresh = incoming.some((id) => !known.has(id));
    for (const id of incoming) known.add(id);
    if (fresh && data.settings.on && data.settings.ping) playPhonePing();
  }, [chatId, data]);
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
      {on && data?.call?.state === "ringing" && !open && (
        <ForkPhoneRinging
          chatId={chatId}
          call={data.call}
          member={cast.find((member) => member.id === data.call?.from)}
          name={nameOf(data.call.from)}
          dotMatrix={data.settings.dotMatrix}
          onAnswered={() => setOpenTo("call")}
        />
      )}
    </>
  );
}

export function phoneNameOf(cast: readonly PhoneCastMember[], personaName: string, names: Record<string, string> = {}) {
  return (side: string) =>
    side === PHONE_PERSONA
      ? personaName
      : side.startsWith(PHONE_UNKNOWN)
        ? translate("ui.chat.forkphone.unknownNumber")
        : (cast.find((member) => member.id === side)?.name ?? names[side] ?? side.replace(/^contact:/, ""));
}

/** Someone is calling: a card over the chat, with Answer and Decline. */
function ForkPhoneRinging({
  chatId,
  call,
  member,
  name,
  dotMatrix,
  onAnswered,
}: {
  chatId: string;
  call: PhoneCall;
  member?: PhoneCastMember;
  /** As the phone shows them: a contact's name, or "Unknown number". */
  name: string;
  dotMatrix: boolean;
  onAnswered: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const action = useCallAction(chatId);
  return createPortal(
    <div
      role="alertdialog"
      aria-label={localizeUi("ui.chat.forkphone.incoming")}
      className="fork-ui fork-ring fixed inset-x-0 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-2.5 text-foreground shadow-2xl"
    >
      <span className="fork-phone contents">
        <Avatar member={member ?? { id: call.from, name }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] opacity-75">{localizeUi("ui.chat.forkphone.incoming")}</span>
        <span className={cn("block truncate text-[0.9375rem] font-bold", dotMatrix && "fp-dotmatrix")}>{name}</span>
      </span>
      <button
        type="button"
        disabled={action.isPending}
        onClick={() => action.mutate({ action: "decline" })}
        aria-label={localizeUi("ui.chat.forkphone.decline")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--destructive)] text-white disabled:opacity-50"
      >
        <PhoneOff size="1rem" />
      </button>
      <button
        type="button"
        disabled={action.isPending}
        onClick={() => action.mutate({ action: "answer" }, { onSuccess: onAnswered })}
        aria-label={localizeUi("ui.chat.forkphone.answer")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
      >
        {action.isPending ? <Loader2 size="1rem" className="animate-spin" /> : <Phone size="1rem" />}
      </button>
    </div>,
    document.body,
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
  const [view, setView] = useState<View>(
    startWith === "call" ? { name: "call" } : startWith ? { name: "thread", to: startWith } : { name: "home" },
  );
  const callAction = useCallAction(chatId);
  const call = data?.call?.state === "live" ? data.call : null;
  const [draft, setDraft] = useState("");
  const [callLine, setCallLine] = useState("");
  const [typing, setTyping] = useState(false);
  const send = useSendText(chatId);
  const look: ForkPhoneLook = data?.settings ?? DEFAULT_FORK_PHONE_LOOK;
  // With the candybar's QWERTY keys showing, your own keyboard stays down so the two don't stack.
  const caseKeys = look.skin === "candybar" && look.keys === "qwerty";
  const nameOf = phoneNameOf(cast, personaName, data?.names);
  const inCast = (side: string) => cast.some((member) => member.id === side);
  const contacts = data?.settings.contacts ?? [];
  const contactOf = (side: string) => contacts.find((contact) => PHONE_CONTACT + contact.name === side);
  const reply = useTextReply(chatId);

  const threadFor = (to: string): PhoneThread | undefined =>
    data?.threads.find(
      (thread) => (thread.a === PHONE_PERSONA && thread.b === to) || (thread.b === PHONE_PERSONA && thread.a === to),
    );
  const sendDraft = () => {
    if (view.name !== "thread" || !draft.trim() || send.isPending) return;
    const contact = contactOf(view.to);
    if (!inCast(view.to) && !contact && !view.to.startsWith(PHONE_UNKNOWN)) return;
    send.mutate(
      { to: view.to, body: draft },
      {
        onSuccess: () => {
          setDraft("");
          // They answer right away (a card character may leave it for the story's phone agent).
          reply.mutate(view.to);
        },
      },
    );
  };
  const sayLine = () => {
    if (!call || !callLine.trim() || callAction.isPending) return;
    callAction.mutate({ action: "say", line: callLine }, { onSuccess: () => setCallLine("") });
  };
  // Whatever box is on screen: the text you are writing, or your line on the call.
  const box =
    view.name === "call"
      ? { value: callLine, set: setCallLine, go: sayLine }
      : { value: draft, set: setDraft, go: sendDraft };

  const screen = (
    <div className="fp-screen">
      {look.skin === "smartphone" && look.wallpaper && (
        <div className="fp-wallpaper" style={{ backgroundImage: `url("${look.wallpaper}")` }} />
      )}
      {view.name === "home" && (
        <PhoneHome
          cast={cast}
          messages={data?.messages ?? []}
          threads={data?.threads ?? []}
          nameOf={nameOf}
          threadFor={threadFor}
          contacts={contacts}
          onNewContact={() => setView({ name: "contact" })}
          onOpen={(to) => setView({ name: "thread", to })}
          onLook={() => setView({ name: "look" })}
          call={call}
          callName={call ? nameOf(call.from) : ""}
          onCall={() => setView({ name: "call" })}
        />
      )}
      {view.name === "thread" && (
        <PhoneThreadView
          chatId={chatId}
          to={view.to}
          member={cast.find((member) => member.id === view.to)}
          name={nameOf(view.to)}
          left={!inCast(view.to) && !contactOf(view.to) && !view.to.startsWith(PHONE_UNKNOWN)}
          onSaveNumber={
            view.to.startsWith(PHONE_UNKNOWN) ? () => setView({ name: "contact", from: view.to }) : undefined
          }
          contact={contactOf(view.to)}
          onEditContact={() => setView({ name: "contact", edit: contactOf(view.to)?.name })}
          replying={reply.isPending && reply.variables === view.to}
          caseKeys={caseKeys}
          personaName={personaName}
          thread={threadFor(view.to)}
          messages={data?.messages ?? []}
          draft={draft}
          onDraft={setDraft}
          onTyping={setTyping}
          onSend={sendDraft}
          sending={send.isPending}
          onBack={() => setView({ name: "home" })}
          onCall={
            (inCast(view.to) || contactOf(view.to) || view.to.startsWith(PHONE_UNKNOWN)) && !data?.call
              ? () => callAction.mutate({ action: "call", to: view.to }, { onSuccess: () => setView({ name: "call" }) })
              : undefined
          }
          calling={callAction.isPending}
          ringingId={data?.call?.state === "ringing" ? data.call.id : ""}
        />
      )}
      {view.name === "call" && (
        <PhoneCallView
          chatId={chatId}
          call={call}
          member={call ? cast.find((member) => member.id === call.from) : undefined}
          name={call ? nameOf(call.from) : ""}
          personaName={personaName}
          messages={data?.messages ?? []}
          line={callLine}
          onLine={setCallLine}
          onSay={sayLine}
          saying={callAction.isPending && callAction.variables?.action === "say"}
          caseKeys={caseKeys}
          onBack={() => setView(call ? { name: "thread", to: call.from } : { name: "home" })}
        />
      )}
      {view.name === "look" && <PhoneLook chatId={chatId} look={look} onBack={() => setView({ name: "home" })} />}
      {view.name === "contact" && (
        <ContactForm
          chatId={chatId}
          contact={view.edit ? contacts.find((contact) => contact.name === view.edit) : undefined}
          from={view.from}
          onDone={(name) =>
            setView(
              name
                ? { name: "thread", to: PHONE_CONTACT + name }
                : view.from
                  ? { name: "thread", to: view.from }
                  : { name: "home" },
            )
          }
        />
      )}
    </div>
  );

  return (
    <div className="fork-ui flex flex-col gap-2 pb-2">
      <ForkPhoneShell
        look={look}
        screen={screen}
        typing={typing || box.value.length > 0}
        labels={{
          back: localizeUi("ui.chat.forkphone.back"),
          ok: localizeUi("ui.chat.forkphone.send"),
          text: localizeUi("ui.chat.forkphone.textKey"),
          brand: localizeUi("ui.chat.forkphone.brand"),
          clear: localizeUi("ui.chat.forkphone.clearKey"),
          space: localizeUi("ui.chat.forkphone.spaceKey"),
        }}
        onBack={() => setView({ name: "home" })}
        onOk={() => (view.name === "thread" || view.name === "call" ? box.go() : undefined)}
        onClear={() =>
          (view.name === "thread" || view.name === "call") && box.value
            ? box.set(box.value.slice(0, -1))
            : setView({ name: "home" })
        }
        onKey={(key) => {
          if (view.name !== "thread" && view.name !== "call") return;
          if (key === "\n") return box.go();
          box.set(key === "⌫" ? box.value.slice(0, -1) : box.value + key);
        }}
      />
    </div>
  );
}

function PhoneHome({
  cast,
  messages,
  threads,
  nameOf,
  threadFor,
  contacts,
  onNewContact,
  onOpen,
  onLook,
  call,
  callName,
  onCall,
}: {
  cast: readonly PhoneCastMember[];
  messages: readonly PhoneMessage[];
  threads: readonly PhoneThread[];
  nameOf: (side: string) => string;
  threadFor: (to: string) => PhoneThread | undefined;
  contacts: readonly ForkPhoneContact[];
  onNewContact: () => void;
  onOpen: (to: string) => void;
  onLook: () => void;
  call: PhoneCall | null;
  callName: string;
  onCall: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  // A character who left the chat keeps a greyed thread you can still read.
  const former = threads
    .filter((thread) => thread.a === PHONE_PERSONA || thread.b === PHONE_PERSONA)
    .map((thread) => otherSide(thread))
    .filter(
      (side) =>
        !side.startsWith(PHONE_CONTACT) &&
        !side.startsWith(PHONE_UNKNOWN) &&
        !cast.some((member) => member.id === side),
    )
    .map((side) => ({ id: side, name: nameOf(side), left: true }));
  // Numbers you have not saved yet.
  const unknown = threads
    .filter((thread) => thread.a === PHONE_PERSONA || thread.b === PHONE_PERSONA)
    .map((thread) => otherSide(thread))
    .filter((side) => side.startsWith(PHONE_UNKNOWN))
    .map((side) => ({ id: side, name: nameOf(side), left: false }));
  type Row = PhoneCastMember & { left: boolean; relation?: ForkPhoneRelation };
  const people: Row[] = contacts.map((contact) => ({
    id: PHONE_CONTACT + contact.name,
    name: contact.name,
    left: false,
    relation: contact.relation,
  }));
  const rows = ([...cast.map((member) => ({ ...member, left: false })), ...people, ...unknown, ...former] as Row[])
    .map((member) => {
      const thread = threadFor(member.id);
      const own = thread ? messages.filter((message) => message.threadId === thread.id) : [];
      const last = [...own].reverse().find((message) => message.kind !== "draft" && message.kind !== "call_line");
      const unread = own.filter((message) => !message.read && message.sender !== PHONE_PERSONA).length;
      return { member, last, unread, at: last?.createdAt ?? "" };
    })
    // Newest conversation first; people you have not texted keep the cast's order after them.
    .sort((left, right) => right.at.localeCompare(left.at));
  return (
    <>
      <div className="fp-bar">
        <span className="flex-1">{localizeUi("ui.chat.forkphone.messages")}</span>
        <button type="button" onClick={onNewContact} aria-label={localizeUi("ui.chat.forkphone.newContact")}>
          <UserPlus size="0.875rem" />
        </button>
        <button type="button" onClick={onLook} aria-label={localizeUi("ui.chat.forkphone.look")}>
          <Palette size="0.875rem" />
        </button>
      </div>
      <div className="fp-scroll">
        {call && (
          <button type="button" className="fp-row" onClick={onCall}>
            <Phone size="0.875rem" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">
              {localizeUi("ui.chat.forkphone.onCall", { name: callName })}
            </span>
          </button>
        )}
        {rows.length === 0 && (
          <p className="m-0 p-2 text-xs opacity-75">{localizeUi("ui.chat.forkphone.noContacts")}</p>
        )}
        {rows.map(({ member, last, unread }) => (
          <button
            key={member.id}
            type="button"
            className={cn("fp-row", member.left && "opacity-55")}
            onClick={() => onOpen(member.id)}
          >
            <Avatar member={member} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[0.8125rem] font-bold">
                  {member.left ? localizeUi("ui.chat.forkphone.leftName", { name: member.name }) : member.name}
                </span>
                {member.relation && (
                  <span className="fp-tag">{localizeUi(`ui.chat.forkphone.relation.${member.relation}`)}</span>
                )}
              </span>
              <span className="block truncate text-[0.6875rem] opacity-75">
                {last
                  ? last.kind === "call"
                    ? last.body.startsWith("(missed)")
                      ? localizeUi("ui.chat.forkphone.callMissed", { name: member.name })
                      : localizeUi("ui.chat.forkphone.callPreview", { about: last.body })
                    : last.body
                  : localizeUi("ui.chat.forkphone.sayHi")}
              </span>
            </span>
            {unread > 0 && <span className="fp-unread" aria-label={localizeUi("ui.chat.forkphone.unread")} />}
          </button>
        ))}
        <button type="button" className="fp-row fp-row-add" onClick={onNewContact}>
          <UserPlus size="0.875rem" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">
            {localizeUi("ui.chat.forkphone.newContact")}
          </span>
        </button>
      </div>
    </>
  );
}

function PhoneThreadView({
  chatId,
  to,
  member,
  name,
  left,
  onSaveNumber,
  contact,
  onEditContact,
  replying,
  caseKeys,
  personaName,
  thread,
  messages,
  draft,
  onDraft,
  onTyping,
  onSend,
  sending,
  onBack,
  onCall,
  calling,
  ringingId,
}: {
  ringingId: string;
  chatId: string;
  to: string;
  member?: PhoneCastMember;
  name: string;
  /** They left the chat: the thread can be read but not written to. */
  left: boolean;
  /** An unknown number: save it as a contact. */
  onSaveNumber?: () => void;
  /** One of your contacts (not a card character). */
  contact?: ForkPhoneContact;
  onEditContact: () => void;
  /** A contact is writing back. */
  replying: boolean;
  /** The case's own keys do the typing. */
  caseKeys: boolean;
  personaName: string;
  thread?: PhoneThread;
  messages: readonly PhoneMessage[];
  draft: string;
  onDraft: (value: string) => void;
  onTyping: (typing: boolean) => void;
  onSend: () => void;
  sending: boolean;
  onBack: () => void;
  /** Call them; missing while a call is already on. */
  onCall?: () => void;
  calling: boolean;
}) {
  const { t: localizeUi } = useUiTranslation();
  const markRead = useMarkThreadRead(chatId);
  const remove = useDeleteText(chatId);
  const endRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(
    () =>
      thread
        ? messages.filter(
            (message) => message.threadId === thread.id && message.kind !== "draft" && message.kind !== "call_line",
          )
        : [],
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
  }, [shown.length, replying]);

  const [tool, setTool] = useState<{ kind: "fix" | "edit"; message: PhoneMessage } | null>(null);
  const swipe = useSwipeText(chatId);
  const clear = useClearThread(chatId);
  const clearThread = async () => {
    if (!thread) return;
    if (
      !(await showConfirmDialog({
        title: localizeUi("ui.chat.forkphone.clearThread"),
        message: localizeUi("ui.chat.forkphone.clearThreadBody", { name }),
        confirmLabel: localizeUi("ui.chat.forkphone.clear"),
        chatStyle: true,
      }))
    )
      return;
    clear.mutate(thread.id);
  };
  // The newest text either side sent: "Read" shows under yours only while it is the last word.
  const lastWordId = [...shown].reverse().find((message) => message.kind === "text" || message.kind === "photo")?.id;
  // A line with the story's day wherever the day changes.
  const dayBefore = (index: number) => {
    const day = shown[index]!.storyDate;
    if (!day) return null;
    const previous = shown
      .slice(0, index)
      .reverse()
      .find((message) => message.storyDate)?.storyDate;
    return previous === day ? null : (
      <p className="fp-day m-0 self-center text-[0.625rem] font-semibold uppercase tracking-wide opacity-60">{day}</p>
    );
  };
  const renderMessage = (message: PhoneMessage) => {
    const mine = message.sender === PHONE_PERSONA;
    if (message.kind === "call") {
      const lines = messages.filter((line) => line.kind === "call_line" && line.callId === message.id);
      return (
        <details key={message.id} className="self-center text-center text-[0.6875rem] opacity-85">
          <summary className="cursor-pointer list-none">
            {callCardText(message, lines.length, name, message.id === ringingId, localizeUi)}
            {message.body && !message.body.startsWith("(missed)")
              ? localizeUi("ui.chat.forkphone.callAbout", { about: message.body })
              : ""}
          </summary>
          {lines.map((line) => (
            <p key={line.id} className="m-0 text-left">
              <b>
                {localizeUi("ui.chat.forkphone.callLine", {
                  name: line.sender === PHONE_PERSONA ? personaName : name,
                })}
              </b>{" "}
              {line.body}
            </p>
          ))}
        </details>
      );
    }
    const isText = message.kind === "text";
    // Their newest text swipes like a story reply; long-press fixes theirs or edits yours.
    const swipeable = isText && !mine && message.id === newestId;
    return (
      <div key={message.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
        <PhoneBubble
          className={cn("fp-bubble", mine ? "is-me" : "is-them", tool?.message.id === message.id && "is-picked")}
          onSwipe={swipeable ? (dx) => swipeText(swipe, message, dx) : undefined}
          onLongPress={isText ? () => setTool({ kind: mine ? "edit" : "fix", message }) : undefined}
        >
          {message.body}
        </PhoneBubble>
        <span className="fp-time flex items-center gap-1">
          {message.storyTime || ""}
          {mine && message.seenAt && message.id === lastWordId && (
            <span className="font-semibold">
              {message.seenAt === "seen"
                ? localizeUi("ui.chat.forkphone.seen")
                : localizeUi("ui.chat.forkphone.seenAt", { time: message.seenAt })}
            </span>
          )}
          {swipeable && <SwipeRow swipe={swipe} message={message} onFix={() => setTool({ kind: "fix", message })} />}
          {mine && isText && (
            <button
              type="button"
              onClick={() => setTool({ kind: "edit", message })}
              aria-label={localizeUi("ui.chat.forkphone.editText")}
              className="flex h-8 w-8 items-center justify-center opacity-80"
            >
              <PencilLine size="0.6875rem" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void removeText(message)}
            aria-label={localizeUi("ui.chat.forkphone.deleteText")}
            className="flex h-8 w-8 items-center justify-center opacity-80"
          >
            <Trash2 size="0.6875rem" />
          </button>
        </span>
      </div>
    );
  };
  const newestId = [...shown].reverse().find((message) => message.kind === "text" || message.kind === "photo")?.id;

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
        <Avatar member={member ?? { id: to, name }} />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {contact && (
          <>
            <span className="fp-tag">{localizeUi(`ui.chat.forkphone.relation.${contact.relation}`)}</span>
            <button
              type="button"
              onClick={onEditContact}
              aria-label={localizeUi("ui.chat.forkphone.editContact", { name })}
            >
              <PencilLine size="0.875rem" />
            </button>
          </>
        )}
        {thread && shown.length > 0 && (
          <button
            type="button"
            onClick={() => void clearThread()}
            disabled={clear.isPending}
            aria-label={localizeUi("ui.chat.forkphone.clearThread")}
          >
            <Eraser size="0.875rem" />
          </button>
        )}
        {onSaveNumber && (
          <button type="button" onClick={onSaveNumber} aria-label={localizeUi("ui.chat.forkphone.saveNumber")}>
            <UserPlus size="0.875rem" />
          </button>
        )}
        {onCall && (
          <button
            type="button"
            onClick={onCall}
            disabled={calling}
            aria-label={localizeUi("ui.chat.forkphone.callButton", { name: name })}
          >
            {calling ? <Loader2 size="0.875rem" className="animate-spin" /> : <Phone size="0.875rem" />}
          </button>
        )}
      </div>
      <div className="fp-scroll">
        {shown.length === 0 && (
          <p className="m-0 p-2 text-center text-xs opacity-75">
            {localizeUi("ui.chat.forkphone.emptyThread", { name: name })}
          </p>
        )}
        {shown.map((message, index) => (
          <Fragment key={message.id}>
            {dayBefore(index)}
            {renderMessage(message)}
          </Fragment>
        ))}
        {replying && (
          <div className="fp-bubble is-them fp-typing" aria-label={localizeUi("ui.chat.forkphone.typing", { name })}>
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={endRef} />
      </div>
      {tool ? (
        tool.kind === "fix" ? (
          <PhoneFixPanel chatId={chatId} message={tool.message} onClose={() => setTool(null)} />
        ) : (
          <PhoneEditPanel chatId={chatId} message={tool.message} onClose={() => setTool(null)} />
        )
      ) : left ? (
        <p className="m-0 border-t border-[var(--ps-line)] p-2 text-center text-[0.6875rem] opacity-75">
          {localizeUi("ui.chat.forkphone.leftChat", { name })}
        </p>
      ) : (
        <div className="fp-compose">
          <label className="sr-only" htmlFor="fork-phone-draft">
            {localizeUi("ui.chat.forkphone.writeTo", { name: name, me: personaName })}
          </label>
          <textarea
            id="fork-phone-draft"
            rows={1}
            inputMode={caseKeys ? "none" : undefined}
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
      )}
    </>
  );
}

type Localize = (key: string, options?: Record<string, unknown>) => string;

/** "📞 Theo · 2 min", "📞 Missed call from Theo", or "📞 Theo is calling…". */
function callCardText(call: PhoneMessage, lines: number, name: string, ringing: boolean, localizeUi: Localize): string {
  if (ringing) return localizeUi("ui.chat.forkphone.callRinging", { name });
  if (call.body.startsWith("(missed)") || (lines === 0 && call.sender !== PHONE_PERSONA))
    return localizeUi("ui.chat.forkphone.callMissed", { name });
  return localizeUi("ui.chat.forkphone.callDone", { name, minutes: callMinutes(lines) });
}

/** On a call: you type your lines, they answer one at a time. Text only. */
function PhoneCallView({
  chatId,
  call,
  member,
  name,
  personaName,
  messages,
  line,
  onLine,
  onSay,
  saying,
  caseKeys,
  onBack,
}: {
  chatId: string;
  call: PhoneCall | null;
  member?: PhoneCastMember;
  name: string;
  personaName: string;
  messages: readonly PhoneMessage[];
  line: string;
  onLine: (line: string) => void;
  onSay: () => void;
  saying: boolean;
  caseKeys: boolean;
  onBack: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const action = useCallAction(chatId);
  const endRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () => (call ? messages.filter((message) => message.kind === "call_line" && message.callId === call.id) : []),
    [call, messages],
  );
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length, saying]);
  return (
    <>
      <div className="fp-bar">
        <button type="button" onClick={onBack} aria-label={localizeUi("ui.chat.forkphone.back")}>
          <ArrowLeft size="0.875rem" />
        </button>
        <Avatar member={member ?? { id: call?.from ?? "", name }} />
        <span className="min-w-0 flex-1 truncate">
          {call ? localizeUi("ui.chat.forkphone.onCall", { name }) : localizeUi("ui.chat.forkphone.callEnded")}
        </span>
        {call && (
          <button
            type="button"
            onClick={() => action.mutate({ action: "hang-up" }, { onSuccess: onBack })}
            aria-label={localizeUi("ui.chat.forkphone.hangUp")}
            className="text-[var(--destructive)]"
          >
            <PhoneOff size="0.875rem" />
          </button>
        )}
      </div>
      <div className="fp-scroll">
        {call && lines.length === 0 && (
          <p className="m-0 p-2 text-center text-xs opacity-75">{localizeUi("ui.chat.forkphone.callJustStarted")}</p>
        )}
        {lines.map((entry) => {
          const mine = entry.sender === PHONE_PERSONA;
          return (
            <div key={entry.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <span className="fp-time">{mine ? personaName : name}</span>
              <div className={cn("fp-bubble", mine ? "is-me" : "is-them")}>{entry.body}</div>
            </div>
          );
        })}
        {saying && <Loader2 size="0.875rem" className="animate-spin self-start opacity-75" />}
        <div ref={endRef} />
      </div>
      {call && (
        <div className="fp-compose">
          <label className="sr-only" htmlFor="fork-phone-call-line">
            {localizeUi("ui.chat.forkphone.sayPlaceholder")}
          </label>
          <textarea
            id="fork-phone-call-line"
            rows={1}
            inputMode={caseKeys ? "none" : undefined}
            value={line}
            placeholder={localizeUi("ui.chat.forkphone.sayPlaceholder")}
            onChange={(event) => onLine(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSay();
              }
            }}
            className="fork-keep-size"
          />
          <button
            type="button"
            onClick={onSay}
            disabled={!line.trim() || saying}
            aria-label={localizeUi("ui.chat.forkphone.say")}
          >
            <SendHorizontal size="0.875rem" />
          </button>
        </div>
      )}
    </>
  );
}

/** Adding a contact, or changing what they are to you. Their name stays once saved. */
function ContactForm({
  chatId,
  contact,
  from,
  onDone,
}: {
  chatId: string;
  contact?: ForkPhoneContact;
  /** Saving an unknown number: its texts move to the new contact. */
  from?: string;
  /** Back to their conversation (a name), or home. */
  onDone: (name?: string) => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const { add, edit, remove } = useContacts(chatId);
  const [name, setName] = useState(contact?.name ?? "");
  const [relation, setRelation] = useState<ForkPhoneRelation>(contact?.relation ?? "friend");
  const [note, setNote] = useState(contact?.note ?? "");
  const busy = add.isPending || edit.isPending || remove.isPending;
  const save = () => {
    if (!name.trim() || busy) return;
    const input = { name: name.trim(), relation, note };
    if (contact) {
      const renamed = input.name.replace(/\s+/g, " ");
      edit.mutate(
        { ...input, name: contact.name, ...(renamed !== contact.name ? { rename: renamed } : {}) },
        { onSuccess: () => onDone(renamed) },
      );
    } else add.mutate({ ...input, from }, { onSuccess: () => onDone(input.name.replace(/\s+/g, " ")) });
  };
  const removeContact = async () => {
    if (!contact) return;
    if (
      !(await showConfirmDialog({
        title: localizeUi("ui.chat.forkphone.deleteContact", { name: contact.name }),
        message: localizeUi("ui.chat.forkphone.deleteContactBody", { name: contact.name }),
        confirmLabel: localizeUi("ui.chat.forkphone.delete"),
        chatStyle: true,
      }))
    )
      return;
    remove.mutate(contact.name, { onSuccess: () => onDone() });
  };
  return (
    <>
      <div className="fp-bar">
        <button type="button" onClick={() => onDone(contact?.name)} aria-label={localizeUi("ui.chat.forkphone.back")}>
          <ArrowLeft size="0.875rem" />
        </button>
        <span className="flex-1">
          {localizeUi(contact ? "ui.chat.forkphone.editContactTitle" : "ui.chat.forkphone.newContact")}
        </span>
        <HelpTooltip
          buttonClassName="-m-2 p-2"
          text={localizeUi("ui.chat.forkphone.contactHelp")}
          side="bottom"
          wide
          size="0.8125rem"
        />
      </div>
      <div className="fp-scroll">
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--card)] p-2 text-[0.75rem] text-foreground">
          <label className="flex flex-col gap-1 font-bold">
            {localizeUi("ui.chat.forkphone.contactName")}
            <input
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder={localizeUi("ui.chat.forkphone.contactNamePlaceholder")}
              className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-2 font-normal disabled:opacity-70"
            />
          </label>
          <p className="m-0 font-bold">{localizeUi("ui.chat.forkphone.contactRelation")}</p>
          <div className="flex flex-wrap gap-1.5">
            {FORK_PHONE_RELATIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRelation(option)}
                aria-pressed={relation === option}
                className={cn(CHIP, relation === option ? CHIP_ON : CHIP_OFF)}
              >
                {localizeUi(`ui.chat.forkphone.relation.${option}`)}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 font-bold">
            {localizeUi("ui.chat.forkphone.contactNote")}
            <textarea
              value={note}
              rows={3}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
              placeholder={localizeUi("ui.chat.forkphone.contactNotePlaceholder")}
              className="fork-keep-size resize-none rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-2 font-normal"
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={!name.trim() || busy}
            className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            {(add.isPending || edit.isPending) && <Loader2 size="0.875rem" className="animate-spin" />}
            {localizeUi("ui.chat.forkphone.saveContact")}
          </button>
          {contact && (
            <button
              type="button"
              onClick={() => void removeContact()}
              disabled={busy}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] font-semibold text-foreground/80"
            >
              <Trash2 size="0.8125rem" />
              {localizeUi("ui.chat.forkphone.deleteContact", { name: contact.name })}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const SKIN_LABEL_KEYS: Record<ForkPhoneSkin, string> = {
  slider: "ui.chat.forkphone.skin.slider",
  candybar: "ui.chat.forkphone.skin.candybar",
  smartphone: "ui.chat.forkphone.skin.smartphone",
};

export function PhoneLook({
  chatId,
  look,
  onBack,
  characterId,
}: {
  chatId: string;
  look: ForkPhoneLook;
  onBack: () => void;
  /** A character's phone instead of yours. */
  characterId?: string;
}) {
  const { t: localizeUi } = useUiTranslation();
  const update = useUpdatePhoneSettings(chatId);
  const { data: pins } = useBoardPins({ scopeType: "chat", scopeId: chatId });
  const set = (patch: Partial<ForkPhoneLook> & { on?: boolean }) =>
    update.mutate(characterId ? { characterLook: { id: characterId, look: { ...look, ...patch } } } : patch);
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
              ["ping", "ui.chat.forkphone.ping"],
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
          {!characterId && (
            <button
              type="button"
              onClick={() => set({ on: false })}
              className="mt-1 flex min-h-9 items-center justify-center rounded-xl border border-[var(--border)] font-semibold text-foreground/80"
            >
              {localizeUi("ui.chat.forkphone.turnOff")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Texts and calls between the prose: a little card after the story message they followed. */
export function ForkPhoneInlineCards({
  messages,
  all,
  threads,
  cast,
  personaName,
  onOpen,
  ringingId,
  names,
}: {
  /** The call card that is ringing right now, if any. */
  ringingId: string;
  names?: Record<string, string>;
  messages: readonly PhoneMessage[];
  /** Every phone message of the chat, for a call's length. */
  all: readonly PhoneMessage[];
  threads: readonly PhoneThread[];
  cast: readonly PhoneCastMember[];
  personaName: string;
  onOpen: (to: string) => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const nameOf = phoneNameOf(cast, personaName, names);
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
                  ? callCardText(
                      message,
                      all.filter((line) => line.kind === "call_line" && line.callId === message.id).length,
                      nameOf(other),
                      message.id === ringingId,
                      localizeUi,
                    )
                  : localizeUi("ui.chat.forkphone.textCard", {
                      from: nameOf(message.sender),
                      to: nameOf(mine ? other : PHONE_PERSONA),
                    })}
              </span>{" "}
              {!(message.kind === "call" && message.body.startsWith("(missed)")) && (
                <span className="text-foreground/85">{message.body}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
