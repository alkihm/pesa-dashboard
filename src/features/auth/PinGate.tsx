import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { Logo } from "@/app/shell/Logo";
import { Button } from "@/components/Button";
import {
  askForReset,
  clearReset,
  isUnlocked,
  rememberUnlocked,
  wantsReset,
  type PinApi,
  type PinState,
} from "./pin";
import { PinPad } from "./PinPad";
import { signInWithGoogle, useSessionContext } from "./session";
import authStyles from "./auth.module.css";
import styles from "./pin.module.css";

type Stage =
  | { name: "checking" }
  | { name: "offline" }
  | { name: "unlocked" }
  | { name: "enter"; state: PinState }
  | { name: "choose"; reset: boolean };

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

// After sign-in: no PIN yet → choose one. Just signed in with Google → straight in (or choose a new PIN after
// "Forgot PIN?"). Otherwise → enter the PIN. The database checks it; offline, this device does (D-014).
export function PinGate({ children }: { children: ReactNode }) {
  const { state, pin } = useSessionContext();
  const userId = state.status === "signed-in" ? state.session.user.id : "";
  const api = useMemo(() => pin(userId), [pin, userId]);
  const [stage, setStage] = useState<Stage>(() =>
    isUnlocked(userId) ? { name: "unlocked" } : { name: "checking" },
  );

  const unlock = useCallback(() => {
    rememberUnlocked(userId);
    clearReset();
    setStage({ name: "unlocked" });
  }, [userId]);

  useEffect(() => {
    if (stage.name !== "checking") return;
    let active = true;
    api
      .status()
      .then((s) => {
        if (!active) return;
        if (!s.hasPin) setStage({ name: "choose", reset: false });
        else if (s.recentSignIn && wantsReset()) setStage({ name: "choose", reset: true });
        else if (s.recentSignIn) unlock();
        else setStage({ name: "enter", state: s });
      })
      .catch(() => active && setStage({ name: "offline" }));
    return () => {
      active = false;
    };
  }, [stage.name, api, unlock]);

  switch (stage.name) {
    case "unlocked":
      return children;
    case "checking":
      return (
        <main className={authStyles.splash} aria-busy="true" aria-label="Loading">
          <Logo size={72} />
        </main>
      );
    case "offline":
      return (
        <main className={authStyles.page}>
          <div className={authStyles.panel}>
            <Logo size={72} />
            <h1 className={authStyles.title}>Can’t check your PIN</h1>
            <p className={authStyles.text}>
              Connect once to unlock. After that, this device can check your PIN offline too.
            </p>
            <Button block onClick={() => setStage({ name: "checking" })}>
              Try again
            </Button>
          </div>
        </main>
      );
    case "enter":
      return (
        <EnterPin
          initial={stage.state}
          api={api}
          onUnlock={unlock}
          onLockOver={() => setStage({ name: "checking" })}
        />
      );
    case "choose":
      return <ChoosePin reset={stage.reset} api={api} onChosen={unlock} />;
  }
}

type Problem = "wrong" | "offline" | "google" | null;

function EnterPin({
  initial,
  api,
  onUnlock,
  onLockOver,
}: {
  initial: PinState;
  api: PinApi;
  onUnlock: () => void;
  onLockOver: () => void;
}) {
  const { auth } = useSessionContext();
  const location = useLocation();
  const [triesLeft, setTriesLeft] = useState(initial.triesLeft);
  const [lockedUntil, setLockedUntil] = useState(initial.lockedUntil);
  const [problem, setProblem] = useState<Problem>(null);

  // Once the lock runs out, ask the database again rather than trusting this device's clock.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setTimeout(onLockOver, Math.max(lockedUntil.getTime() - Date.now(), 0) + 1000);
    return () => clearTimeout(id);
  }, [lockedUntil, onLockOver]);

  const check = async (value: string) => {
    try {
      const result = await api.verify(value);
      if (result.ok) return onUnlock();
      setTriesLeft(result.triesLeft);
      setLockedUntil(result.lockedUntil);
      setProblem("wrong");
    } catch {
      setProblem("offline");
    }
  };

  const forgot = async () => {
    setProblem(null);
    askForReset();
    const { error } = await signInWithGoogle(auth(), location.pathname + location.search);
    if (error) {
      clearReset();
      setProblem("google");
    }
  };

  const hint = lockedUntil
    ? `Too many tries · try again at ${time.format(lockedUntil)}`
    : problem === "wrong"
      ? `Wrong PIN · ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left`
      : problem === "offline"
        ? "Could not check the PIN. Check your connection."
        : problem === "google"
          ? "Google sign-in did not start. Try again."
          : initial.offline
            ? "🔒 Offline · checked on this device"
            : "🔒 Locked";

  return (
    <PinPad
      title="Enter your PIN"
      hint={hint}
      alert={lockedUntil !== null || problem !== null}
      disabled={lockedUntil !== null}
      onComplete={check}
      footer={
        <>
          <button type="button" className={styles.link} onClick={forgot}>
            Forgot PIN? Reset with Google
          </button>
          <p className={styles.note}>5 wrong tries = 15 min lock</p>
        </>
      }
    />
  );
}

function ChoosePin({ reset, api, onChosen }: { reset: boolean; api: PinApi; onChosen: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [problem, setProblem] = useState<"mismatch" | "save" | null>(null);

  const enter = async (value: string) => {
    if (first === null) {
      setFirst(value);
      setProblem(null);
      return;
    }
    setFirst(null);
    if (value !== first) return setProblem("mismatch");
    try {
      await api.set(value);
      onChosen();
    } catch {
      setProblem("save");
    }
  };

  const hint =
    first !== null
      ? "Enter it again to check"
      : problem === "mismatch"
        ? "Those did not match. Choose a PIN again."
        : problem === "save"
          ? "Could not save the PIN. Try again."
          : "6 digits · not your M-PESA or bank PIN";

  return (
    <PinPad
      title={reset ? "Choose a new PIN" : "Choose a PIN"}
      hint={hint}
      alert={first === null && problem !== null}
      onComplete={enter}
      footer={<p className={styles.note}>5 wrong tries = 15 min lock</p>}
    />
  );
}
