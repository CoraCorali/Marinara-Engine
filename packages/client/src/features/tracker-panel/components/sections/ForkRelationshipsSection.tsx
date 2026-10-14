// ──────────────────────────────────────────────
// Fork: the Relationships section of the tracker panel (see FORK.md)
// ──────────────────────────────────────────────
// A compact read of People: each bond with you on one line, then how the characters stand with
// each other. It takes the place of Marinara's downloadable Relationship Tracker; "Open People"
// goes to the full cards.
import { useState } from "react";
import { ArrowLeftRight, HeartHandshake } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import type { PresentCharacter } from "@marinara-engine/shared";
import { useBondPairs, useBonds, type Bond, type BondPair } from "../../../../hooks/use-fork-bonds";
import { useCharacter } from "../../../../hooks/use-characters";
import { openForkPanel } from "../../../../lib/fork/open-panel";
import { cn } from "../../../../lib/utils";
import { SectionHeader, TRACKER_SECTION_SHELL_CLASS } from "../controls/SectionControls";

/** A card's name: from the scene when present, else from the card itself. */
function useName(characterId: string, label: string, present: readonly PresentCharacter[]): string {
  const fromScene = present.find((member) => member.characterId === characterId)?.name ?? "";
  const { data } = useCharacter(!label.trim() && !fromScene ? characterId : null);
  if (label.trim()) return label.trim();
  if (fromScene) return fromScene;
  const raw = (data as { data?: unknown } | undefined)?.data;
  try {
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as { name?: unknown }) : (raw as { name?: unknown });
    return typeof parsed?.name === "string" ? parsed.name : "";
  } catch {
    return "";
  }
}

const ROW_CLASS =
  "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-foreground/5";

function BondRow({ bond, present }: { bond: Bond; present: readonly PresentCharacter[] }) {
  const { t: localizeUi } = useUiTranslation();
  const name = useName(bond.characterId, bond.label, present);
  return (
    <button type="button" onClick={() => openForkPanel("people")} className={ROW_CLASS}>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-bold text-foreground">{name || "?"}</span>{" "}
        <span className="text-[var(--muted-foreground)]">
          {localizeUi("ui.characters.characterversionhistorypanel.value1", {
            value1: [bond.rung, bond.status].filter(Boolean).join(" · "),
          })}
        </span>
      </span>
      {bond.drift && (
        <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-px text-[0.6875rem] font-semibold">
          {bond.drift}
        </span>
      )}
    </button>
  );
}

function PairRow({ pair, present }: { pair: BondPair; present: readonly PresentCharacter[] }) {
  const a = useName(pair.aId, "", present);
  const b = useName(pair.bId, "", present);
  return (
    <button type="button" onClick={() => openForkPanel("people")} className={ROW_CLASS}>
      <span className="min-w-0 truncate font-bold text-foreground">{a || "?"}</span>
      <ArrowLeftRight size="0.625rem" className="shrink-0 text-[var(--muted-foreground)]" />
      <span className="min-w-0 truncate font-bold text-foreground">{b || "?"}</span>
      <span className="ml-auto shrink-0 text-[var(--muted-foreground)]">{pair.rung}</span>
    </button>
  );
}

/** The rows alone, for the tracker panel's section and the phone HUD's popup alike. */
export function ForkRelationshipsList({
  activeChatId,
  presentCharacters,
}: {
  activeChatId: string;
  presentCharacters: readonly PresentCharacter[];
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data: bonds } = useBonds(activeChatId);
  const { data: pairs } = useBondPairs(activeChatId);
  if ((bonds ?? []).length === 0 && (pairs ?? []).length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {(bonds ?? []).map((bond) => (
        <BondRow key={bond.id} bond={bond} present={presentCharacters} />
      ))}
      {(pairs ?? []).length > 0 && (
        <>
          <p className="px-2 pt-1 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
            {localizeUi("ui.chat.forkbonds.betweenThem")}
          </p>
          {(pairs ?? []).map((pair) => (
            <PairRow key={pair.id} pair={pair} present={presentCharacters} />
          ))}
        </>
      )}
    </div>
  );
}

export function ForkRelationshipsSection({
  activeChatId,
  presentCharacters,
}: {
  activeChatId: string;
  presentCharacters: readonly PresentCharacter[];
}) {
  const { t: localizeUi } = useUiTranslation();
  const { data: bonds } = useBonds(activeChatId);
  const { data: pairs } = useBondPairs(activeChatId);
  const [collapsed, setCollapsed] = useState(false);
  // Nothing tracked yet: the section stays out of the way rather than showing an empty box.
  if ((bonds ?? []).length === 0 && (pairs ?? []).length === 0) return null;
  return (
    <div className={cn(TRACKER_SECTION_SHELL_CLASS, "transition-colors duration-200")}>
      <SectionHeader
        icon={<HeartHandshake size="0.6875rem" />}
        title={localizeUi("ui.trackerPanel.forkRelationships.title")}
        className="[--primary:var(--foreground)] [--tracker-profile-icon:var(--muted-foreground)]"
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        action={
          <button
            type="button"
            onClick={() => openForkPanel("people")}
            className="rounded-full px-2 py-1 text-[0.6875rem] font-semibold text-[var(--primary)] hover:bg-foreground/10"
          >
            {localizeUi("ui.trackerPanel.forkRelationships.openPeople")}
          </button>
        }
      />
      {!collapsed && (
        <div className="px-1.5 pb-2">
          <ForkRelationshipsList activeChatId={activeChatId} presentCharacters={presentCharacters} />
        </div>
      )}
    </div>
  );
}
