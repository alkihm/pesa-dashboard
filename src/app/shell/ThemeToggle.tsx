import { useState } from "react";
import { getThemePreference, resolveTheme, setThemePreference } from "@/lib/theme";
import { Icon } from "@/components/Icon";
import styles from "./PageHeader.module.css";

// Flips between light and dark. Settings ([4.9]) adds "follow the system" back as a choice.
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => resolveTheme(getThemePreference()));
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        setThemePreference(next);
        setTheme(next);
      }}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
