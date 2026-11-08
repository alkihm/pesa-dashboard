import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { env } from "@/lib/env";
import type { Db } from "@/lib/supabase";
import {
  browserPushEnv,
  currentSubscription,
  pushState,
  sendTest,
  turnOff,
  turnOn,
  type PushState,
} from "./push";
import styles from "./SettingsScreen.module.css";

const TEXT: Record<PushState, { pill: string; tone: "green" | "grey" | "amber" | "red"; note: string }> = {
  on: { pill: "✓ On", tone: "green", note: "This device gets the alerts switched on below." },
  off: { pill: "Off", tone: "grey", note: "Turn on to get the alerts below on this device." },
  denied: {
    pill: "Blocked",
    tone: "red",
    note: "Notifications are blocked for this app. Allow them in the device settings, then come back.",
  },
  "needs-install": {
    pill: "Install first",
    tone: "amber",
    note: "On iPhone, notifications work in the installed app: Share → Add to Home Screen, then open it from there.",
  },
  unsupported: {
    pill: "Not here",
    tone: "grey",
    note: "This browser cannot show notifications from the app.",
  },
  "not-configured": {
    pill: "Not set up",
    tone: "grey",
    note: "Notifications are not set up for this build yet.",
  },
};

/** [4.4] Notifications on this device: state, turn on/off, send a test. */
export function PushRow({ db }: { db: () => Db }) {
  const [vapidKey] = useState(() => env().vapidPublicKey);
  const [state, setState] = useState<PushState>(() => pushState(browserPushEnv(vapidKey), false));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();

  useEffect(() => {
    let live = true;
    if (state !== "off") return;
    void currentSubscription()
      .then((sub) => live && sub && setState(pushState(browserPushEnv(vapidKey), true)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [state, vapidKey]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(undefined);
    try {
      await action();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  }

  const t = TEXT[state];
  return (
    <div className={styles.push}>
      <div className={styles.row}>
        <span aria-hidden="true" className={styles.rowEmoji}>
          📲
        </span>
        <span className={styles.rowText}>Notifications on this device</span>
        <StatusPill tone={t.tone}>{t.pill}</StatusPill>
      </div>
      <p className={styles.note}>{t.note}</p>
      {(state === "off" || state === "on") && (
        <div className={styles.choice}>
          {state === "off" ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run(async () => setState(await turnOn(db(), vapidKey!)))}
            >
              Turn on
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const devices = await sendTest(db());
                    setMessage({
                      text: `Test sent to ${devices} device${devices === 1 ? "" : "s"}.`,
                      ok: true,
                    });
                  })
                }
              >
                Send a test
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await turnOff(db());
                    setState("off");
                  })
                }
              >
                Turn off
              </Button>
            </>
          )}
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? styles.ok : styles.problem}>
          {message.text}
        </p>
      )}
    </div>
  );
}
