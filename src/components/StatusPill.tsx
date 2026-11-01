import type { ReactNode } from "react";
import styles from "./StatusPill.module.css";

export type Tone = "red" | "orange" | "amber" | "blue" | "green" | "grey";

/**
 * Status label on a tinted pill. The text carries the meaning ("Overdue · 2 days", "✓ Paid");
 * the tone only reinforces it, so status is never shown by colour alone.
 */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>;
}
