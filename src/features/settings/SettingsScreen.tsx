import { useState } from "react";

import { PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import { Segmented } from "@/components/Segmented";
import { StatusPill } from "@/components/StatusPill";
import { SyncCard } from "@/features/sync/SyncCard";
import { supabase, type Db } from "@/lib/supabase";
import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";
import { backupState, savePrefs, smsState, useSettingsData, type Prefs, type SettingsData } from "./data";
import { ImportExportCard, ManageCard } from "./Links";
import { MoneyPrefs } from "./MoneyPrefs";
import { PinCard } from "./PinCard";
import { RemindersCard } from "./Reminders";
import styles from "./SettingsScreen.module.css";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "☀️ Light" },
  { value: "dark", label: "🌙 Dark" },
  { value: "system", label: "📱 System" },
];

function ThemeSwitch({ variant }: { variant: "header" | "surface" }) {
  const [theme, setTheme] = useState(getThemePreference);
  return (
    <Segmented
      label="Theme"
      variant={variant}
      options={THEMES}
      value={theme}
      onChange={(next) => {
        setThemePreference(next);
        setTheme(next);
      }}
    />
  );
}

function Sources({ data, now }: { data?: SettingsData; now?: Date }) {
  if (!data) return null;
  const sources = [
    { emoji: "📲", name: "iPhone Shortcut", ...smsState(data.lastSmsAt, now) },
    { emoji: "📊", name: "Google Sheet backup", ...backupState(data.backup, now) },
  ];
  return (
    <ul className={styles.rows} aria-label="Where the data comes from">
      {sources.map((s) => (
        <li key={s.name} className={styles.source}>
          <EmojiTile emoji={s.emoji} size="sm" />
          <span className={styles.linkText}>
            <span className={styles.linkTitle}>{s.name}</span>
            <span className={styles.linkMeta}>{s.meta}</span>
          </span>
          <StatusPill tone={s.tone}>{s.pill}</StatusPill>
        </li>
      ))}
    </ul>
  );
}

interface ScreenProps {
  db?: () => Db;
  now?: Date;
}

// [4.9] One place to control the app (D11): data sources and the offline queue ([4.5]), review interval and alert
// switches (read by [4.3] and [4.4]), PIN, theme, and links to the report, import/export and the manage screens.
export function SettingsScreen({ db = supabase, now }: ScreenProps) {
  const { data, error, setPrefs } = useSettingsData(db);
  const [saveError, setSaveError] = useState<string>();

  async function change(prefs: Prefs) {
    if (!data) return;
    const before = data.prefs;
    setSaveError(undefined);
    setPrefs(prefs);
    try {
      await savePrefs(db(), prefs);
    } catch (e) {
      setPrefs(before);
      setSaveError(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="PIN, reminders, data sync and appearance"
        back="/"
        controls={
          <div className={styles.phoneOnly}>
            <ThemeSwitch variant="header" />
          </div>
        }
      />
      <div className={styles.page}>
        {(error || saveError) && (
          <p role="alert" className={styles.problem}>
            {saveError ?? `Could not load settings: ${error}`}
          </p>
        )}
        <SyncCard sources={<Sources data={data} now={now} />} />
        {data ? (
          <RemindersCard prefs={data.prefs} onChange={(p) => void change(p)} />
        ) : (
          <Card title="🔔 Reminders & alerts">
            <p className={styles.note}>Loading…</p>
          </Card>
        )}
        <PinCard />
        <Card title="🎨 Appearance">
          <div className={styles.desktopOnly}>
            <ThemeSwitch variant="surface" />
            <p className={styles.note}>System follows the light or dark setting on this device.</p>
          </div>
          {data && <MoneyPrefs prefs={data.prefs} onChange={(p) => void change(p)} />}
        </Card>
        <ImportExportCard now={now} />
        <ManageCard counts={data?.counts} />
      </div>
    </>
  );
}
