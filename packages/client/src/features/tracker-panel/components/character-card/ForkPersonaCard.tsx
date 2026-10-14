// ──────────────────────────────────────────────
// Fork: the persona card (see FORK.md)
// ──────────────────────────────────────────────
// The persona's own Option A card: who you are today, what you have on (from the board), where you
// are (from the world state), who you are closest to (from People), your stats as rings with a
// word, and what you are holding. Each line opens the place it comes from.
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import {
  FORK_PIN_WHO_PERSONA,
  FORK_WEAR_SLOTS,
  type CharacterStat,
  type Persona,
  type PresentCharacter,
} from "@marinara-engine/shared";
import { useBoardPins, type BoardPin } from "../../../../hooks/use-fork-board";
import { useBonds, type Bond } from "../../../../hooks/use-fork-bonds";
import { useChat, useUpdateChatMetadata } from "../../../../hooks/use-chats";
import { useCharacter } from "../../../../hooks/use-characters";
import { openForkPanel } from "../../../../lib/fork/open-panel";
import { statWordKey } from "../../../../lib/fork/stat-words";
import { getStatPercent } from "../../lib/tracker-stat-layout";
import { InlineEdit } from "../controls/InlineControls";
import { PIN_SLOT_LABEL_KEYS } from "../../../../components/chat/ForkPinEditor";

const LABEL_CLASS =
  "flex items-center gap-1 text-[0.6875rem] font-bold uppercase tracking-wide text-[color:var(--tracker-profile-accent-solid)]";
const LINE_CLASS =
  "flex min-h-9 w-full min-w-0 items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--tracker-profile-text)_7%,transparent)] px-2 py-1 text-left text-[0.8125rem] text-[color:var(--tracker-profile-text)]";

/** A character row's name; its card data may still be JSON text. */
function cardName(row: unknown): string {
  const data = (row as { data?: unknown } | undefined)?.data;
  try {
    const parsed = typeof data === "string" ? (JSON.parse(data) as { name?: unknown }) : (data as { name?: unknown });
    return typeof parsed?.name === "string" ? parsed.name : "";
  } catch {
    return "";
  }
}

/** The romance first, then whoever is warmest: one line for "Closest". */
function closestBond(bonds: readonly Bond[]): Bond | null {
  return bonds.find((bond) => bond.kind === "love") ?? bonds[0] ?? null;
}

function Ring({ stat }: { stat: CharacterStat }) {
  const { t: localizeUi } = useUiTranslation();
  const percent = getStatPercent(stat);
  return (
    <div
      className="flex min-w-0 flex-col items-center gap-0.5"
      title={localizeUi("ui.trackerPanel.ring.value1Value2Value3", {
        value1: stat.name,
        value2: stat.value,
        value3: stat.max,
      })}
    >
      <span
        role="meter"
        aria-label={stat.name}
        aria-valuemin={0}
        aria-valuemax={stat.max}
        aria-valuenow={stat.value}
        className="block h-9 w-9 rounded-full [mask:radial-gradient(circle_0.8125rem,#0000_97%,#000)]"
        style={{
          background: `conic-gradient(${stat.color || "var(--tracker-profile-accent-solid)"} ${percent}%, color-mix(in srgb, var(--tracker-profile-text) 14%, transparent) 0)`,
        }}
      />
      <span className="max-w-full truncate text-[0.6875rem] font-semibold">{stat.name}</span>
      <span className="text-[0.6875rem] italic text-[color:var(--tracker-profile-muted-text)]">
        {localizeUi(statWordKey(percent))}
      </span>
    </div>
  );
}

export function ForkPersonaCard({
  activeChatId,
  persona,
  status,
  onSaveStatus,
  personaStats,
  location,
  holding,
  presentCharacters,
}: {
  activeChatId: string;
  persona: Persona | null;
  status: string;
  onSaveStatus: (status: string) => void;
  personaStats: readonly CharacterStat[];
  location: string | null;
  holding: readonly string[];
  presentCharacters: readonly PresentCharacter[];
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data: chat } = useChat(activeChatId);
  const updateMeta = useUpdateChatMetadata({ serialize: true });
  const { data: chatPins } = useBoardPins({ scopeType: "chat", scopeId: activeChatId });
  const { data: personaPins } = useBoardPins(persona ? { scopeType: "persona", scopeId: persona.id } : null);
  const { data: bonds } = useBonds(activeChatId);

  const metadata = (chat?.metadata ?? {}) as Record<string, unknown>;
  const today = typeof metadata.forkPersonaToday === "string" ? metadata.forkPersonaToday : "";

  // What you have on: your in-scene wearing pins from this chat and from your always-on board.
  const wearing = useMemo(() => {
    const worn = [...(personaPins ?? []), ...(chatPins ?? [])].filter(
      (pin) => pin.inScene && pin.category === "wearing" && pin.who === FORK_PIN_WHO_PERSONA,
    );
    return worn.sort(
      (left, right) => FORK_WEAR_SLOTS.indexOf(left.slot || "outfit") - FORK_WEAR_SLOTS.indexOf(right.slot || "outfit"),
    );
  }, [chatPins, personaPins]);
  const place: BoardPin | null = (chatPins ?? []).find((pin) => pin.inScene && pin.category === "place") ?? null;
  const closest = closestBond(bonds ?? []);
  // A card character's bond has no label of its own; its name comes from the scene or the card.
  const { data: closestCard } = useCharacter(closest && !closest.label.trim() ? closest.characterId : null);
  const closestName = closest
    ? closest.label.trim() ||
      presentCharacters.find((member) => member.characterId === closest.characterId)?.name ||
      cardName(closestCard)
    : "";

  if (!persona) return null;
  const avatar = persona.avatarPath ?? null;

  return (
    <article className="@container relative flex min-w-0 flex-col gap-2 rounded-2xl border border-[color-mix(in_srgb,var(--tracker-profile-rule)_52%,transparent)] bg-[image:var(--tracker-profile-material)] p-3 text-[color:var(--tracker-profile-text)] shadow-[0_0_14px_color-mix(in_srgb,var(--tracker-profile-dialogue-glow)_14%,transparent)] [background-blend-mode:var(--tracker-profile-material-blend)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--muted)] text-lg font-extrabold ring-2 ring-[var(--tracker-profile-accent-solid)] ring-offset-2 ring-offset-[var(--card)]">
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span aria-hidden="true">{persona.name.trim().charAt(0) || "?"}</span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="max-w-full truncate text-base font-extrabold">{persona.name}</span>
          <InlineEdit
            value={status}
            onSave={onSaveStatus}
            placeholder={localizeUi("ui.trackerPanel.forkPersona.statusPlaceholder")}
            className="max-w-full rounded-full bg-[color-mix(in_srgb,var(--tracker-profile-accent-solid)_20%,transparent)] px-2.5 py-1 text-xs font-semibold [--tracker-inline-foreground:var(--tracker-profile-text)]"
            showEditHint={false}
            previewLineCount="full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className={LABEL_CLASS}>{localizeUi("ui.trackerPanel.forkPersona.today")}</p>
        <InlineEdit
          value={today}
          onSave={(value) => updateMeta.mutate({ id: activeChatId, forkPersonaToday: value.trim() })}
          placeholder={localizeUi("ui.trackerPanel.forkPersona.todayPlaceholder")}
          className="w-full min-w-0 px-0 py-0 text-[0.8125rem] leading-snug [--tracker-inline-foreground:var(--tracker-profile-text)]"
          showEditHint={false}
          previewLineCount="full"
        />
      </div>

      <div className="flex flex-col gap-1">
        <p className={LABEL_CLASS}>
          <span aria-hidden="true">👗</span>
          {localizeUi("ui.trackerPanel.forkPersona.wearing")}
        </p>
        {wearing.map((pin) => (
          <button key={pin.id} type="button" onClick={() => openForkPanel("board")} className={LINE_CLASS}>
            <img src={pin.imagePath} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" draggable={false} />
            <span className="min-w-0 flex-1">
              {pin.slot && (
                <span className="font-bold">
                  {localizeUi("ui.trackerPanel.forkpersonacard.value1", {
                    value1: localizeUi(PIN_SLOT_LABEL_KEYS[pin.slot]),
                  })}
                </span>
              )}
              <span className="line-clamp-2">{pin.caption || "—"}</span>
            </span>
            <ChevronRight size="0.75rem" className="shrink-0 opacity-60" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => openForkPanel("board")}
          className={`${LINE_CLASS} border border-dashed border-[color-mix(in_srgb,var(--tracker-profile-text)_25%,transparent)] bg-transparent text-xs text-[color:var(--tracker-profile-muted-text)]`}
        >
          {localizeUi(
            wearing.length > 0 ? "ui.trackerPanel.forkPersona.addPiece" : "ui.trackerPanel.forkPersona.pinOutfit",
          )}
        </button>
      </div>

      {location && (
        <div className="flex flex-col gap-1">
          <p className={LABEL_CLASS}>
            <span aria-hidden="true">📍</span>
            {localizeUi("ui.trackerPanel.forkPersona.here")}
          </p>
          <button type="button" onClick={() => openForkPanel("board")} className={LINE_CLASS}>
            {place && (
              <img
                src={place.imagePath}
                alt=""
                className="h-7 w-7 shrink-0 rounded-md object-cover"
                draggable={false}
              />
            )}
            <span className="min-w-0 flex-1 truncate">{location}</span>
          </button>
        </div>
      )}

      {closest && closestName && (
        <div className="flex flex-col gap-1">
          <p className={LABEL_CLASS}>
            <span aria-hidden="true">💞</span>
            {localizeUi("ui.trackerPanel.forkPersona.closest")}
          </p>
          <button type="button" onClick={() => openForkPanel("people")} className={LINE_CLASS}>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-bold">{closestName}</span>
              {localizeUi("ui.characters.characterversionhistorypanel.value1", {
                value1: [closest.rung, closest.drift].filter(Boolean).join(" · "),
              })}
            </span>
            <ChevronRight size="0.75rem" className="shrink-0 opacity-60" />
          </button>
        </div>
      )}

      {personaStats.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className={LABEL_CLASS}>{localizeUi("ui.trackerPanel.forkPersona.stats")}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {personaStats.map((stat, index) => (
              <Ring key={`${stat.name}-${index}`} stat={stat} />
            ))}
          </div>
        </div>
      )}

      {holding.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className={LABEL_CLASS}>
            <span aria-hidden="true">🎒</span>
            {localizeUi("ui.trackerPanel.forkPersona.holding")}
          </p>
          <p className="text-[0.8125rem] leading-snug">
            {holding.slice(0, 4).join(" · ")}
            {holding.length > 4 && (
              <span className="text-[color:var(--tracker-profile-muted-text)]"> +{holding.length - 4}</span>
            )}
          </p>
        </div>
      )}
    </article>
  );
}
