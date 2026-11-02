import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/app/shell/Logo";
import { PIN_LENGTH } from "./pin";
import styles from "./pin.module.css";

interface PinPadProps {
  title: string;
  hint: string;
  /** The hint reports a problem (a wrong PIN, the lock), so it is announced straight away. */
  alert?: boolean;
  disabled?: boolean;
  /** Called with all six digits. The dots clear once it settles. */
  onComplete: (pin: string) => Promise<void>;
  footer?: ReactNode;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// The keypad from the "PIN sign-in · mobile" board. A keyboard works too: digits, Backspace, Escape.
export function PinPad({ title, hint, alert = false, disabled = false, onComplete, footer }: PinPadProps) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const off = disabled || busy;

  const type = (digit: string) => {
    if (off || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length < PIN_LENGTH) return;
    setBusy(true);
    void onComplete(next).finally(() => {
      setBusy(false);
      setPin("");
    });
  };
  const clear = () => !off && setPin("");
  const back = () => !off && setPin(pin.slice(0, -1));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) type(event.key);
      else if (event.key === "Backspace") back();
      else if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className={styles.page}>
      <Logo size={72} />
      <h1 className={styles.title}>{title}</h1>
      <p className={alert && !busy ? styles.alert : styles.hint} role={alert && !busy ? "alert" : undefined}>
        {busy ? "Checking…" : hint}
      </p>

      <div className={styles.dots} role="status" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < pin.length ? styles.dotFilled : styles.dot} aria-hidden="true" />
        ))}
      </div>

      <div className={styles.keys}>
        {DIGITS.map((d) => (
          <button key={d} type="button" className={styles.key} onClick={() => type(d)} disabled={off}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className={styles.ghostKey}
          onClick={clear}
          disabled={off}
          aria-label="Clear PIN"
        >
          Clear
        </button>
        <button type="button" className={styles.key} onClick={() => type("0")} disabled={off}>
          0
        </button>
        <button
          type="button"
          className={`${styles.ghostKey} ${styles.backKey}`}
          onClick={back}
          disabled={off}
          aria-label="Delete last digit"
        >
          ⌫
        </button>
      </div>

      <div className={styles.footer}>{footer}</div>
    </main>
  );
}
