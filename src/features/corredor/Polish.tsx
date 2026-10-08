import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { Quantities } from "./model";

export function BoxStack() {
  return (
    <svg className="box-stack" viewBox="0 0 112 88" fill="none" aria-hidden="true">
      <path d="M9 77h95" stroke="#c8d5ef" strokeWidth="2" strokeLinecap="round" />
      <g transform="translate(7 31)">
        <path d="m0 12 24-11 24 11v27L24 50 0 39Z" fill="#3165db" />
        <path
          d="m0 12 24 11 24-11M24 23v27M12 6l24 11v9"
          stroke="#edf3ff"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </g>
      <g transform="translate(54 31)">
        <path d="m0 12 24-11 24 11v27L24 50 0 39Z" fill="#ffd85a" />
        <path
          d="m0 12 24 11 24-11M24 23v27M12 6l24 11v9"
          stroke="#83641e"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </g>
      <g transform="translate(31 1)">
        <path
          d="m0 12 24-11 24 11v27L24 50 0 39Z"
          fill="#f2f6ff"
          stroke="#9cb7ef"
          strokeWidth="1.8"
        />
        <path
          d="m0 12 24 11 24-11M24 23v27M12 6l24 11v9"
          stroke="#5880c9"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
let introStarted = false;
export function OpeningLogo() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (introStarted) return;
    introStarted = true;
    try {
      if (sessionStorage.getItem("meu-corredor-opening")) return;
      sessionStorage.setItem("meu-corredor-opening", "1");
    } catch {
      /* In-memory guard still prevents replay if session storage is unavailable. */
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setShow(true);
    const dismiss = () => setShow(false);
    // No data loading waits for this timer. CSS defaults to invisible and the
    // overlay never intercepts input, even if animations or JS cleanup fail.
    const timer = window.setTimeout(dismiss, 900);
    window.addEventListener("pointerdown", dismiss, { once: true });
    window.addEventListener("keydown", dismiss, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="opening-logo" aria-hidden="true">
      <span className="opening-symbol">
        <Icon name="box" size={42} />
      </span>
      <span className="opening-name">Meu Corredor</span>
    </div>
  );
}
export function QuantityBoxes({ closed, open }: Quantities) {
  return (
    <div className="quantity-preview" aria-label="Resumo dos fardos informados">
      {(
        [
          { count: closed, label: "Fechados", type: "closed" },
          { count: open, label: "Pra abrir", type: "open" },
        ] as const
      ).map(({ count, label, type }) => {
        const safe = Number.isSafeInteger(count) && count >= 0 ? count : 0;
        return (
          <div className={`quantity-preview-row ${type}`} key={type}>
            <span className="preview-label">
              <strong>{safe}</strong> {label}
            </span>
            <span className="preview-boxes" aria-hidden="true">
              {Array.from({ length: Math.min(safe, 4) }, (_, n) => (
                <Icon key={n} name="box" size={20} />
              ))}
              {safe === 0 && <span className="preview-zero">—</span>}
              {safe > 4 && <span className="preview-more">+{safe - 4}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
