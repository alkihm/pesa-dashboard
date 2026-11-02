import { Card } from "@/components/Card";
import { categoryColourVar } from "@/lib/categoryColours";
import { formatAmount } from "@/lib/money";
import type { CategoryTotal } from "./summary";
import styles from "./CategorySummary.module.css";

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

/** This month's spending per category as bars, largest first. `month` is "2026-10-01". */
export function CategorySummary({ month, totals }: { month: string; totals?: CategoryTotal[] }) {
  const max = Math.max(1, ...(totals ?? []).map((t) => t.cents));

  return (
    <Card title={`${monthName.format(new Date(month))} by category`}>
      {totals && totals.length === 0 && <p className={styles.empty}>No spending yet this month.</p>}
      <ul className={styles.list}>
        {totals?.map((t) => (
          <li key={t.key} className={t.colour ? styles.row : `${styles.row} ${styles.review}`}>
            <span className={styles.label}>
              <span aria-hidden="true">{t.emoji}</span> {t.label}
            </span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={styles.bar}
                style={{
                  width: `${(t.cents / max) * 100}%`,
                  background: t.colour ? categoryColourVar(t.colour) : "var(--tone-amber-dot)",
                }}
              />
            </span>
            <span className={styles.amount}>{formatAmount(t.cents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
