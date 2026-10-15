// ──────────────────────────────────────────────
// Fork: the Pocket Phone's case — slider, candybar or smartphone (see FORK.md)
// ──────────────────────────────────────────────
import type { ReactNode } from "react";
import { ArrowLeft, Check, CornerDownLeft, Delete } from "lucide-react";
import type { ForkPhoneLook } from "@marinara-engine/shared";
import "../../../styles/fork-phone.css";

const QWERTY = "QWERTYUIOPASDFGHJKL".split("");
const QWERTY_LAST = "ZXCVBNM".split("");
const NUMBER_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "✱", "0", "#"];

/** Rhinestone flowers around the screen, from the Motorola photo. */
function Gems() {
  // On the frame around the screen, never over what is on it.
  const spots: { style: React.CSSProperties; dark?: boolean; glyph?: string }[] = [
    { style: { top: "-0.55rem", left: "0.9rem" } },
    { style: { top: "-0.6rem", right: "2.2rem" }, dark: true },
    { style: { top: "-0.5rem", right: "0.8rem" } },
    { style: { bottom: "-0.6rem", left: "2rem" } },
    { style: { bottom: "-0.55rem", left: "3.6rem" }, dark: true, glyph: "❀" },
    { style: { bottom: "-0.6rem", right: "1.4rem" } },
  ];
  return (
    <>
      {spots.map((spot, index) => (
        <span key={index} aria-hidden="true" className={`fp-gem${spot.dark ? " is-dark" : ""}`} style={spot.style}>
          {spot.glyph ?? "✿"}
        </span>
      ))}
    </>
  );
}

function Stickers() {
  const stickers: [string, React.CSSProperties][] = [
    ["🦄", { top: "0.2rem", left: "0.6rem" }],
    ["⭐", { top: "0.3rem", left: "3rem", fontSize: "0.8rem" }],
    ["💖", { top: "0.35rem", right: "0.7rem", fontSize: "0.75rem" }],
    ["⭐", { bottom: "0.2rem", left: "0.6rem" }],
    ["😊", { bottom: "0.15rem", left: "2.2rem", fontSize: "0.85rem" }],
    ["💎", { bottom: "0.2rem", right: "0.7rem" }],
  ];
  return (
    <>
      {stickers.map(([glyph, style], index) => (
        <span key={index} aria-hidden="true" className="fp-sticker" style={style}>
          {glyph}
        </span>
      ))}
    </>
  );
}

export function ForkPhoneShell({
  look,
  screen,
  typing = false,
  onKey,
  onBack,
  onOk,
  labels,
}: {
  look: ForkPhoneLook;
  /** What the screen shows. */
  screen: ReactNode;
  /** The slider's keypad slides out while you are writing. */
  typing?: boolean;
  /** A candybar key was pressed: a letter, " ", "\n" or "⌫". */
  onKey?: (key: string) => void;
  onBack?: () => void;
  onOk?: () => void;
  labels: { back: string; ok: string; text: string; brand: string; clear: string; space: string };
}) {
  const press = (key: string) => () => onKey?.(key);
  return (
    <div className="fork-phone" data-skin={look.skin} data-color={look.color}>
      <div className="fp-body">
        {look.skin === "candybar" && look.stickers && <Stickers />}
        {look.skin === "slider" && (
          <>
            <div className="fp-dots" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="fp-brand" aria-hidden="true">
              {labels.brand}
            </div>
          </>
        )}
        <div className="relative w-full">
          {look.gems && <Gems />}
          {screen}
        </div>
        {look.skin === "slider" && (
          <div className="fp-nav">
            <button type="button" className="fp-soft" onClick={onBack} aria-label={labels.back}>
              <ArrowLeft size="0.875rem" />
            </button>
            <button type="button" className="fp-pad" onClick={onOk} aria-label={labels.ok}>
              <Check size="0.875rem" />
            </button>
            <button type="button" className="fp-soft" onClick={onBack} aria-label={labels.back}>
              {labels.clear}
            </button>
          </div>
        )}
        {look.skin === "candybar" && (
          <>
            <div className="fp-cnav">
              <span aria-hidden="true">🧁</span>
              <button type="button" onClick={onOk}>
                {labels.text}
              </button>
              <button type="button" className="fp-ok" onClick={onOk} aria-label={labels.ok}>
                ☀
              </button>
              <button type="button" onClick={onBack}>
                {labels.back}
              </button>
              <span aria-hidden="true">👽</span>
            </div>
            {look.keys === "qwerty" ? (
              <div className="fp-keys is-qwerty">
                {QWERTY.map((key) => (
                  <button key={key} type="button" onClick={press(key.toLowerCase())}>
                    {key}
                  </button>
                ))}
                <button type="button" onClick={press("\n")} aria-label={labels.ok}>
                  <CornerDownLeft size="0.625rem" className="mx-auto" />
                </button>
                {QWERTY_LAST.map((key) => (
                  <button key={key} type="button" onClick={press(key.toLowerCase())}>
                    {key}
                  </button>
                ))}
                <button type="button" onClick={press(".")}>
                  .
                </button>
                <button type="button" onClick={press("?")}>
                  ?
                </button>
                <button type="button" onClick={press("!")}>
                  !
                </button>
                <button type="button" className="fp-space" onClick={press(" ")}>
                  {labels.space}
                </button>
                <button type="button" onClick={press(",")}>
                  ,
                </button>
                <button type="button" onClick={press("'")}>
                  '
                </button>
                <button type="button" onClick={press("⌫")} aria-label="⌫">
                  <Delete size="0.625rem" className="mx-auto" />
                </button>
                <button type="button" onClick={press("♥")}>
                  ♥
                </button>
              </div>
            ) : (
              // Number keys are for the look: typing still happens on your own keyboard.
              <div className="fp-keys is-number" aria-hidden="true">
                {NUMBER_KEYS.map((key) => (
                  <button key={key} type="button" tabIndex={-1}>
                    {key}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {look.skin === "slider" && (
        <>
          <div className={`fp-slide${typing ? "" : " is-closed"}`} aria-hidden="true">
            {NUMBER_KEYS.map((key) => (
              <span key={key}>{key}</span>
            ))}
          </div>
          <div className="fp-foot" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
