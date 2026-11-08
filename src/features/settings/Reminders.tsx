import { useId, type ReactNode } from "react";

import { Card } from "@/components/Card";
import { Segmented } from "@/components/Segmented";
import { Switch } from "@/components/Switch";
import { ALERTS, type AlertKey } from "@/lib/alerts";
import type { Prefs } from "./data";
import { INTERVALS, intervalNote } from "./rules";
import styles from "./SettingsScreen.module.css";

interface Props {
  prefs: Prefs;
  onChange: (prefs: Prefs) => void;
  disabled?: boolean;
  /** The device's notification row ([4.4]). */
  push?: ReactNode;
}

export function RemindersCard({ prefs, onChange, disabled, push }: Props) {
  const id = useId();
  const options = INTERVALS.map((d) => ({ value: String(d), label: `${d} days` }));
  // A value saved elsewhere that is not one of the buttons still shows, as its own button.
  if (!INTERVALS.includes(prefs.reviewIntervalDays as (typeof INTERVALS)[number]))
    options.push({ value: String(prefs.reviewIntervalDays), label: `${prefs.reviewIntervalDays} days` });

  const toggle = (key: AlertKey, on: boolean) =>
    onChange({ ...prefs, alerts: { ...prefs.alerts, [key]: on } });

  return (
    <Card title="🔔 Reminders & alerts">
      {push}
      <Segmented
        label="Review reminder every"
        variant="surface"
        options={options}
        value={String(prefs.reviewIntervalDays)}
        onChange={(v) => onChange({ ...prefs, reviewIntervalDays: Number(v) })}
      />
      <p className={styles.note}>{intervalNote(prefs.reviewIntervalDays)}</p>
      <ul className={styles.rows} aria-label="Alerts">
        {ALERTS.map((a) => (
          <li key={a.key} className={styles.row}>
            <span aria-hidden="true" className={styles.rowEmoji}>
              {a.emoji}
            </span>
            <span id={`${id}-${a.key}`} className={styles.rowText}>
              {a.label}
            </span>
            <Switch
              checked={prefs.alerts[a.key]}
              onChange={(on) => toggle(a.key, on)}
              labelledBy={`${id}-${a.key}`}
              disabled={disabled}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
