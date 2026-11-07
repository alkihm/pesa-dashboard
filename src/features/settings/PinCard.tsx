// [4.9] PIN & security. Changing the PIN asks for the current one first. The database only takes a new PIN within
// 10 minutes of a Google sign-in (D-009 rule 10, D-014), so when that sign-in is older the card offers the same
// "confirm with Google" round trip as "Forgot PIN?": back from Google, the PIN screen asks for the new PIN.

import { useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/Field";
import { askForReset, clearReset, PIN_LENGTH } from "@/features/auth/pin";
import { signInWithGoogle, useSessionContext } from "@/features/auth/session";
import { pinProblem, type Problem } from "./rules";
import styles from "./SettingsScreen.module.css";

const NEEDS_GOOGLE = /sign in with google again/i;

export function PinCard() {
  const { state, auth, pin } = useSessionContext();
  const userId = state.status === "signed-in" ? state.session.user.id : null;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [problem, setProblem] = useState<Problem>();
  const [needsGoogle, setNeedsGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function google() {
    setProblem(undefined);
    askForReset();
    const { error } = await signInWithGoogle(auth(), "/settings");
    if (error) {
      clearReset();
      setProblem({ text: "Could not reach Google. Try again." });
    }
  }

  async function change(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    setNeedsGoogle(false);
    const wrong = pinProblem(current, next, repeat);
    if (wrong) return setProblem(wrong);
    if (!userId) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const api = pin(userId);
      const check = await api.verify(current);
      if (!check.ok) {
        return setProblem({
          field: "current",
          text: check.lockedUntil
            ? "Too many wrong tries. The PIN is locked for 15 minutes."
            : `That is not your current PIN. ${check.triesLeft} ${check.triesLeft === 1 ? "try" : "tries"} left.`,
        });
      }
      await api.set(next);
      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(true);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (NEEDS_GOOGLE.test(text)) setNeedsGoogle(true);
      else setProblem({ text: `Could not change the PIN: ${text}` });
    } finally {
      setBusy(false);
    }
  }

  const pinInput = {
    inputMode: "numeric" as const,
    maxLength: PIN_LENGTH,
    autoComplete: "off",
    type: "password",
  };

  return (
    <Card title="🔐 PIN & security">
      <button
        type="button"
        className={`${styles.linkRow} ${styles.phoneOnly}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">🔢</span>
        <span className={styles.rowText}>Change PIN</span>
        <span aria-hidden="true">{open ? "⌄" : "›"}</span>
      </button>

      <form className={`${styles.pinForm} ${open ? "" : styles.desktopOnly}`} onSubmit={change} noValidate>
        <div className={styles.pinFields}>
          <TextField
            label="Current PIN"
            {...pinInput}
            aria-invalid={problem?.field === "current" || undefined}
            value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
          />
          <TextField
            label="New PIN"
            {...pinInput}
            aria-invalid={problem?.field === "next" || undefined}
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))}
          />
          <TextField
            label="Repeat"
            {...pinInput}
            aria-invalid={problem?.field === "repeat" || undefined}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        {problem && (
          <p role="alert" className={styles.problem}>
            {problem.text}
          </p>
        )}
        {done && (
          <p role="status" className={styles.ok}>
            ✓ PIN changed. Use the new PIN next time.
          </p>
        )}
        {needsGoogle && (
          <div role="alert" className={styles.callout}>
            <p>
              Your current PIN is right. To change it, confirm it is you with Google first; then choose the
              new PIN.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void google()}>
              Confirm with Google
            </Button>
          </div>
        )}
        <Button type="submit" block disabled={busy}>
          {busy ? "Checking…" : "Change PIN"}
        </Button>
      </form>

      <div className={styles.callout}>
        <p>
          Forgot it?{" "}
          <button type="button" className={styles.inlineLink} onClick={() => void google()}>
            Reset with your Google account
          </button>
          .
        </p>
        <p className={styles.note}>5 wrong tries lock the PIN for 15 minutes.</p>
      </div>
    </Card>
  );
}
