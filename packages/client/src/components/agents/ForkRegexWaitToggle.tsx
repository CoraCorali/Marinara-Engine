// ──────────────────────────────────────────────
// Fork: "Wait until the reply is finished" for one regex script
// ──────────────────────────────────────────────
import { useTranslation as useUiTranslation } from "react-i18next";
import { useForkRegexStore } from "../../stores/fork-regex.store";

/**
 * A script that checks a reply for something that only comes at the end (a closing block, a
 * cut-off warning) would otherwise fire on every half-written reply while it streams in.
 */
export function ForkRegexWaitToggle({ scriptId }: { scriptId: string }) {
  const { t: localizeUi } = useUiTranslation();
  const waiting = useForkRegexStore((s) => s.waitForFinish.includes(scriptId));
  const setWaitForFinish = useForkRegexStore((s) => s.setWaitForFinish);
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-lg bg-[var(--secondary)]/60 px-3 py-2">
      <input
        type="checkbox"
        checked={waiting}
        onChange={(event) => setWaitForFinish(scriptId, event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-xs font-medium">{localizeUi("ui.agents.forkregex.waitForFinish")}</span>
        <span className="text-[0.625rem] text-[var(--muted-foreground)]">
          {localizeUi("ui.agents.forkregex.waitForFinishHelp")}
        </span>
      </span>
    </label>
  );
}
