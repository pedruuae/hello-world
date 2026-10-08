import { useEffect, useRef, useState } from "react";
export function useConfirmation() {
  const [message, setMessage] = useState<string | null>(null);
  const resolve = useRef<((answer: boolean) => void) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const ask = (text: string) =>
    new Promise<boolean>((done) => {
      previousFocus.current = document.activeElement as HTMLElement | null;
      resolve.current = done;
      setMessage(text);
    });
  const settle = (answer: boolean) => {
    const done = resolve.current;
    resolve.current = null;
    setMessage(null);
    done?.(answer);
    previousFocus.current?.focus();
  };
  const dialog = message ? <Confirmation message={message} settle={settle} /> : null;
  return { ask, dialog, confirming: message !== null };
}
function Confirmation({ message, settle }: { message: string; settle: (answer: boolean) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const settleRef = useRef(settle);
  settleRef.current = settle;
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settleRef.current(false);
      }
      if (e.key === "Tab") {
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0]!,
          last = buttons[buttons.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="confirmation-backdrop">
      <div
        ref={panel}
        className="confirmation-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-text"
      >
        <h2 id="confirmation-title">Confirmar ação</h2>
        <p id="confirmation-text">{message}</p>
        <div className="confirmation-actions">
          <button ref={cancel} type="button" onClick={() => settle(false)}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={() => settle(true)}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
