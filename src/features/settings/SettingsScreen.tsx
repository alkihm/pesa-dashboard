import { useState } from "react";
import { PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { Segmented } from "@/components/Segmented";
import { getThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";
import styles from "./SettingsScreen.module.css";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "☀️ Light" },
  { value: "dark", label: "🌙 Dark" },
  { value: "system", label: "📱 System" },
];

// Appearance is the first part of Settings; the rest (sync, reminders, PIN, import/export) comes with [4.9].
export function SettingsScreen() {
  const [theme, setTheme] = useState(getThemePreference);

  return (
    <>
      <PageHeader title="Settings" subtitle="PIN, reminders, data sync and appearance" back="/" />
      <div className={styles.page}>
        <Card title="🎨 Appearance">
          <Segmented
            label="Theme"
            variant="surface"
            options={THEMES}
            value={theme}
            onChange={(next) => {
              setThemePreference(next);
              setTheme(next);
            }}
          />
          <p className={styles.note}>System follows the light or dark setting on this device.</p>
        </Card>
        <Card title="More settings">
          <p className={styles.note}>Sync, reminders, PIN and import or export are built in [4.9].</p>
        </Card>
      </div>
    </>
  );
}
