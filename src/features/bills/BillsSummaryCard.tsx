import { Link } from "react-router";

import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { formatDay } from "@/lib/due";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { useBills, type BillRow } from "./data";
import { billStatus, billTotals, nairobiMonth, sortBills } from "./status";
import styles from "./BillsSummary.module.css";

// The Bills card on Overview / Home ([2.2] boards, built with the bills epic): the month's paid bar and totals;
// desktop also lists the bills. Opens the Bills & budget screen.

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

function when(row: BillRow, now?: Date) {
  const s = billStatus(row, now);
  if (row.status === "due" && s.days !== null && s.days <= 0) return s.text.toLowerCase();
  return formatDay(row.due_on);
}

export function BillsSummaryCard({
  availableCents,
  db = supabase,
  now,
  className,
}: {
  availableCents: number;
  db?: () => Db;
  now?: Date;
  className?: string;
}) {
  const month = nairobiMonth(now);
  const { rows, error } = useBills(db, month);
  const sorted = sortBills(rows ?? []);
  const t = billTotals(sorted, availableCents);
  const title = monthName.format(new Date(`${month}T00:00:00Z`));

  return (
    <Card
      title={
        <>
          🧾 Bills<span className={styles.desktopInline}> · {title}</span>
        </>
      }
      action={
        <Link to="/bills" className={styles.link}>
          <span className={styles.phoneInline}>Open</span>
          <span className={styles.desktopInline}>Manage</span>
        </Link>
      }
      className={className}
      aria-label="Bills"
    >
      {error && (
        <p role="alert" className={styles.muted}>
          Could not load bills: {error}
        </p>
      )}
      {rows && (
        <div className={styles.body}>
          <span
            className={styles.track}
            role="meter"
            aria-label="Share of this month's bills paid"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(t.paidShare * 100)}
          >
            <span style={{ width: `${t.paidShare * 100}%` }} />
          </span>
          <div className={styles.figures}>
            <span>
              Paid <b>{formatAmount(t.paidCents)}</b>
            </span>
            <span>
              Pending <b>{formatAmount(t.toPayCents)}</b>
            </span>
            <span className={styles.desktopInline}>
              After pending <b className={styles.after}>{formatAmount(t.leftAfterPayingCents)}</b>
            </span>
          </div>
          {sorted.length === 0 ? (
            <p className={styles.muted}>No bills yet.</p>
          ) : (
            <ul className={styles.list} aria-label="This month's bills">
              {sorted.map((r) => {
                const s = billStatus(r, now);
                return (
                  <li key={r.id} className={styles.row}>
                    <span aria-hidden="true" className={styles.emoji}>
                      {r.emoji}
                    </span>
                    <span className={styles.name}>
                      <b>{r.name}</b> · {when(r, now)}
                    </span>
                    <span className={styles.amount}>{formatAmount(r.amount_cents)}</span>
                    <StatusPill tone={s.tone}>
                      {r.status === "paid" ? "Paid" : r.status === "skipped" ? "Skipped" : "Pending"}
                    </StatusPill>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
