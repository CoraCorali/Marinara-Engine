// ──────────────────────────────────────────────
// CYOA Choices — interactive choice buttons after assistant messages
// ──────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Dices, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { useUpdateMessageExtra } from "../../hooks/use-chats";
import { useAgentStore } from "../../stores/agent.store";
import { useGenerate } from "../../hooks/use-generate";
import { useChatStore } from "../../stores/chat.store";
import { useUIStore } from "../../stores/ui.store";
import { cn } from "../../lib/utils";
import type { Message } from "@marinara-engine/shared";
import { useTranslation as useUiTranslation } from "react-i18next";
// Fork: Scene Spark marks which kind of choice each one is.
import { parseChoiceLabel } from "../../lib/fork/choice-kind";
import { buildCyoaChoiceSubmissionPayload } from "./cyoa-choice-submission";

type CyoaChoice = {
  label: string;
  text: string;
};

const TRACKER_SAFE_MAX_WIDTH =
  "min(85%, calc(100% - var(--tracker-panel-overlay-clearance, 0px) - var(--tracker-panel-overlay-clearance, 0px)))";

interface Props {
  messages?: Message[];
}

function normalizeChoices(choices: CyoaChoice[]) {
  return choices
    .map((choice, index) => ({
      label: choice.label.trim() || `Choice ${index + 1}`,
      text: choice.text.trim(),
    }))
    .filter((choice) => choice.text.length > 0);
}

export function CyoaChoices({ messages }: Props) {
  const { t: localizeUi } = useUiTranslation();
  const choices = useAgentStore((s) => s.cyoaChoices);
  const choicesChatId = useAgentStore((s) => s.cyoaChoicesChatId);
  const setCyoaChoices = useAgentStore((s) => s.setCyoaChoices);
  const clearCyoaChoices = useAgentStore((s) => s.clearCyoaChoices);
  const { generate, retryAgents } = useGenerate();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const pendingSpatialTransition = useChatStore((s) =>
    activeChatId ? (s.pendingSpatialTransitions.get(activeChatId) ?? null) : null,
  );
  const impersonateCyoaChoices = useUIStore((s) => s.impersonateCyoaChoices);
  const setImpersonateCyoaChoices = useUIStore((s) => s.setImpersonateCyoaChoices);
  const updateMessageExtra = useUpdateMessageExtra(activeChatId);
  const [isEditing, setIsEditing] = useState(false);
  const [isRerolling, setIsRerolling] = useState(false);
  const [draftChoices, setDraftChoices] = useState<CyoaChoice[]>([]);
  const hydratedChatIdRef = useRef<string | null>(null);
  const previousChatIdRef = useRef<string | null>(null);

  const setChoicesForActiveChat = useCallback(
    (nextChoices: CyoaChoice[]) => {
      setCyoaChoices(nextChoices, activeChatId);
    },
    [activeChatId, setCyoaChoices],
  );

  const clearChoicesForActiveChat = useCallback(() => {
    clearCyoaChoices();
  }, [clearCyoaChoices]);

  // Hydrate CYOA choices from the last assistant message's extras on mount / chat switch
  const persistedChoiceState = useMemo(() => {
    if (!messages) return null;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.extra) return null;
    let extra: Record<string, unknown>;
    try {
      extra = typeof lastAssistant.extra === "string" ? JSON.parse(lastAssistant.extra) : lastAssistant.extra;
    } catch {
      return null;
    }
    const saved = extra.cyoaChoices as CyoaChoice[] | undefined;
    // Fork: custom choice agents (like Scene Spark) record their type so Re-roll reruns them.
    const agentType = typeof extra.cyoaChoicesAgentType === "string" ? extra.cyoaChoicesAgentType : "cyoa";
    return saved && saved.length > 0 ? { messageId: lastAssistant.id, choices: saved, agentType } : null;
  }, [messages]);

  useEffect(() => {
    const switchedChats = previousChatIdRef.current !== activeChatId;
    previousChatIdRef.current = activeChatId;

    if (!activeChatId) {
      hydratedChatIdRef.current = null;
      setIsEditing(false);
      setDraftChoices([]);
      clearCyoaChoices();
      return;
    }

    if (switchedChats) {
      hydratedChatIdRef.current = null;
    }

    setIsEditing(false);
    setDraftChoices([]);

    const hasLiveChoicesForActiveChat = choicesChatId === activeChatId && choices.length > 0;

    // Wait until the messages query has produced a value for this chat; otherwise
    // we would mark hydrated too early and skip re-running when extras arrive.
    if (messages === undefined) {
      if (switchedChats && !hasLiveChoicesForActiveChat) clearCyoaChoices();
      return;
    }

    // On chat switch, clear any previous chat's choices and hydrate from the
    // new chat's last assistant extra (if present).
    if (isStreaming) {
      if (switchedChats) clearCyoaChoices();
      return;
    }

    if (persistedChoiceState?.choices?.length) {
      setChoicesForActiveChat(persistedChoiceState.choices);
      hydratedChatIdRef.current = activeChatId;
      return;
    }

    if (hasLiveChoicesForActiveChat) {
      return;
    }

    if (hydratedChatIdRef.current === activeChatId) {
      return;
    }

    if (switchedChats) {
      clearCyoaChoices();
    } else {
      clearChoicesForActiveChat();
    }

    hydratedChatIdRef.current = activeChatId;
  }, [
    activeChatId,
    choices.length,
    choicesChatId,
    clearChoicesForActiveChat,
    clearCyoaChoices,
    isStreaming,
    messages,
    persistedChoiceState,
    setChoicesForActiveChat,
  ]);

  const handleChoice = useCallback(
    async (text: string) => {
      if (!activeChatId || isStreaming || isEditing) return;
      if (persistedChoiceState?.messageId) {
        await updateMessageExtra.mutateAsync({
          messageId: persistedChoiceState.messageId,
          extra: { cyoaChoices: [] },
        });
      }
      clearChoicesForActiveChat();
      const queuedSpatialTransition =
        pendingSpatialTransition?.status === "ready" ? pendingSpatialTransition.transition : null;
      if (impersonateCyoaChoices) {
        const { impersonatePresetId, impersonateConnectionId, impersonateBlockAgents, impersonatePromptTemplate } =
          useUIStore.getState();
        const impersonated = await generate(
          buildCyoaChoiceSubmissionPayload({
            chatId: activeChatId,
            text,
            pendingSpatialTransition: queuedSpatialTransition,
            impersonation: {
              presetId: impersonatePresetId,
              connectionId: impersonateConnectionId,
              blockAgents: impersonateBlockAgents,
              promptTemplate: impersonatePromptTemplate,
            },
          }),
        );
        if (impersonated) {
          await generate({ chatId: activeChatId, connectionId: null });
        }
        return;
      }

      await generate(
        buildCyoaChoiceSubmissionPayload({
          chatId: activeChatId,
          text,
          pendingSpatialTransition: queuedSpatialTransition,
        }),
      );
    },
    [
      activeChatId,
      isStreaming,
      isEditing,
      pendingSpatialTransition,
      impersonateCyoaChoices,
      persistedChoiceState?.messageId,
      clearChoicesForActiveChat,
      generate,
      updateMessageExtra,
    ],
  );

  const handleReroll = useCallback(async () => {
    if (!activeChatId || isStreaming || isEditing || isRerolling) return;
    setIsRerolling(true);
    try {
      // Re-runs ONLY the CYOA agent with fresh context (latest messages + last
      // assistant's extras). The retry route persists the new choices to the
      // message's extra and the SSE handler swaps them into the store.
      await retryAgents(activeChatId, [persistedChoiceState?.agentType ?? "cyoa"]);
    } finally {
      setIsRerolling(false);
    }
  }, [activeChatId, isStreaming, isEditing, isRerolling, persistedChoiceState?.agentType, retryAgents]);

  const handleStartEdit = useCallback(() => {
    setDraftChoices(choices.map((choice) => ({ ...choice })));
    setIsEditing(true);
  }, [choices]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setDraftChoices([]);
  }, []);

  const updateDraftChoice = useCallback((index: number, field: keyof CyoaChoice, value: string) => {
    setDraftChoices((prev) =>
      prev.map((choice, choiceIndex) => (choiceIndex === index ? { ...choice, [field]: value } : choice)),
    );
  }, []);

  const handleSaveChoices = useCallback(async () => {
    const normalizedChoices = normalizeChoices(draftChoices);
    if (normalizedChoices.length === 0) return;

    setChoicesForActiveChat(normalizedChoices);
    if (persistedChoiceState?.messageId) {
      await updateMessageExtra.mutateAsync({
        messageId: persistedChoiceState.messageId,
        extra: { cyoaChoices: normalizedChoices },
      });
    }

    setIsEditing(false);
    setDraftChoices([]);
  }, [draftChoices, persistedChoiceState?.messageId, setChoicesForActiveChat, updateMessageExtra]);

  const controlsBusy = isStreaming || isRerolling || updateMessageExtra.isPending;

  if (choices.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-3 animate-message-in">
      <div
        // Fork: the row used to be 10px type at 60% opacity, which on a phone read as decoration.
        className="flex flex-wrap items-center justify-center gap-2 text-[0.75rem] text-[var(--muted-foreground)]"
        style={{ maxWidth: TRACKER_SAFE_MAX_WIDTH }}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles size="0.8125rem" />
          <span>{localizeUi("ui.chat.cyoachoices.whatWillYouDo")}</span>
        </div>
        <button
          type="button"
          aria-pressed={impersonateCyoaChoices}
          onClick={() => setImpersonateCyoaChoices(!impersonateCyoaChoices)}
          disabled={controlsBusy}
          className={cn(
            "inline-flex min-h-9 items-center rounded-lg border px-2.5 text-[0.6875rem] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
            impersonateCyoaChoices
              ? "mari-chrome-accent-surface mari-accent-animated border-[var(--marinara-chat-chrome-button-border-active)]"
              : "border-[var(--border)] bg-[var(--muted)]/20 text-[var(--foreground)]/60 hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)] dark:border-white/10 dark:bg-black/35 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/80",
          )}
          title={localizeUi(
            impersonateCyoaChoices
              ? "ui.chat.cyoachoices.switchToSendingChoicesNormally"
              : "ui.chat.cyoachoices.switchToImpersonatingChoices",
          )}
        >
          {localizeUi(
            impersonateCyoaChoices ? "settings.quickReplies.impersonate.label" : "ui.chat.cyoachoices.sendNormally",
          )}
        </button>
        <button
          type="button"
          onClick={isEditing ? handleCancelEdit : handleStartEdit}
          disabled={controlsBusy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-2.5 text-[0.6875rem] font-semibold text-[var(--foreground)]/75 transition-all hover:border-[var(--border)] hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-black/35 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/80"
          title={
            isEditing
              ? localizeUi("ui.chat.cyoachoices.cancelEditingChoices")
              : localizeUi("ui.chat.cyoachoices.editCyoaChoices")
          }
        >
          <Pencil size="0.8125rem" />
          <span>
            {isEditing ? localizeUi("chat.delete.dialog.cancel") : localizeUi("ui.noodle.noodlepostcard.edit")}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            void handleReroll();
          }}
          disabled={controlsBusy || isEditing}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-2.5 text-[0.6875rem] font-semibold text-[var(--foreground)]/75 transition-all hover:border-[var(--border)] hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-black/35 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/80"
          title={localizeUi("ui.chat.cyoachoices.reRollCyoaChoicesUsingTheLatestChatContext")}
        >
          {isRerolling ? <Loader2 size="0.8125rem" className="animate-spin" /> : <Dices size="0.8125rem" />}
          <span>
            {isRerolling ? localizeUi("ui.chat.cyoachoices.rolling") : localizeUi("ui.chat.cyoachoices.reRoll")}
          </span>
        </button>
      </div>
      {isEditing ? (
        <div
          className="w-full space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 p-3 backdrop-blur-md dark:border-white/10 dark:bg-black/45"
          style={{ maxWidth: TRACKER_SAFE_MAX_WIDTH }}
        >
          {draftChoices.map((choice, index) => (
            <div
              key={index}
              className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 p-3 dark:border-white/8 dark:bg-black/30"
            >
              <input
                type="text"
                value={choice.label}
                onChange={(e) => updateDraftChoice(index, "label", e.target.value)}
                placeholder={localizeUi("ui.chat.cyoachoices.choiceValue1", { value1: index + 1 })}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-[0.6875rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)] outline-none transition-colors focus:border-[var(--marinara-chat-chrome-input-border-focus)] dark:border-white/10 dark:bg-black/35"
              />
              <textarea
                value={choice.text}
                onChange={(e) => updateDraftChoice(index, "text", e.target.value)}
                rows={Math.min(Math.max(choice.text.split("\n").length, 2), 6)}
                placeholder={localizeUi("ui.chat.cyoachoices.describeTheActionOrDialogueSentWhenThisChoice")}
                className="mt-2 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-[0.6875rem] leading-relaxed text-[var(--foreground)]/80 outline-none transition-colors focus:border-[var(--marinara-chat-chrome-input-border-focus)] dark:border-white/10 dark:bg-black/35 dark:text-white/75"
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={updateMessageExtra.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-1.5 text-[0.625rem] text-[var(--foreground)]/70 transition-colors hover:bg-[var(--muted)]/40 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-black/35 dark:text-white/60"
            >
              <X size="0.75rem" />
              <span>{localizeUi("chat.delete.dialog.cancel")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSaveChoices();
              }}
              disabled={updateMessageExtra.isPending || normalizeChoices(draftChoices).length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[0.625rem] text-emerald-200 transition-colors hover:bg-emerald-500/15 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {updateMessageExtra.isPending ? (
                <Loader2 size="0.75rem" className="animate-spin" />
              ) : (
                <Check size="0.75rem" />
              )}
              <span>
                {updateMessageExtra.isPending
                  ? localizeUi("ui.noodle.noodlehome.saving")
                  : localizeUi("ui.chat.cyoachoices.saveChoices")}
              </span>
            </button>
          </div>
        </div>
      ) : (
        // Fork: one choice per row rather than a wrapped grid. Four of these wrapping on a phone
        // produced columns a few words wide, and the type was small enough to squint at.
        <div className="flex w-full flex-col gap-2" style={{ maxWidth: TRACKER_SAFE_MAX_WIDTH }}>
          {choices.map((choice, i) => {
            const parsed = parseChoiceLabel(choice.label);
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleChoice(choice.text)}
                disabled={isStreaming || isRerolling}
                className="group relative w-full rounded-xl border border-[var(--border)] bg-[var(--card)]/80 px-3.5 py-3 text-left backdrop-blur-md transition-all hover:border-[var(--marinara-chat-chrome-button-border-hover)] hover:bg-[var(--marinara-chat-chrome-highlight-bg)] hover:shadow-lg active:scale-[0.99] disabled:opacity-50 dark:border-white/10 dark:bg-black/50"
              >
                {parsed.kind !== "plain" && (
                  <span
                    className={cn(
                      "mb-1.5 inline-block rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide",
                      parsed.kind === "direction"
                        ? "bg-[var(--pastel-sky)] text-[var(--rgb-blue)]"
                        : "bg-[var(--pastel-rose)] text-[var(--rgb-violet)]",
                    )}
                  >
                    {localizeUi(
                      parsed.kind === "direction"
                        ? "ui.chat.cyoachoices.kindDirection"
                        : "ui.chat.cyoachoices.kindAction",
                    )}
                  </span>
                )}
                {/* Fork: no animated accent here. Four of these animate at once, every turn, which costs
                    paint on a phone for an effect nobody asked a choice list to have. */}
                <span className="block text-[0.875rem] font-bold leading-snug text-[var(--marinara-chat-chrome-panel-title)] group-hover:text-[var(--marinara-chat-chrome-button-text-hover)]">
                  {parsed.label}
                </span>
                <span className="mt-1 block text-[0.8125rem] leading-relaxed text-[var(--foreground)]/75 group-hover:text-[var(--foreground)]/90 dark:text-white/60 dark:group-hover:text-white/80">
                  {choice.text}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
