import { useEffect, useId, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { owed } from "@/features/accounts/accounts";
import type { MonthTotalsRow } from "@/features/month/month";
import type { Account } from "@/lib/data/accounts";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { allocate, clearText, incomeBase, type Instalment, type LineState } from "./allocation";
import styles from "./LoanRepayment.module.css";

// [3.5] Loan repayment on Overview / Home: a slider for the share of income that goes to loans, saved in
// settings.loan_allocation_pct. Bills linked to a loan (bills.loan_account_id, the car instalment) are paid first,
// then short-term loans smallest first. Phones show the share and the months-to-clear (Home board); desktop also
// lists the split (Overview board).

const STATE_LABEL: Record<LineState, string> = { paid: "Paid", cleared: "Cleared", part: "Part", none: "" };

function useLoanSettings(db: () => Db) {
  const [instalments, setInstalments] = useState<Instalment[]>();
  const [pct, setPct] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    void Promise.all([
      db()
        .from("bills")
        .select("id, name, emoji, amount_cents, due_day")
        .not("loan_account_id", "is", null)
        .is("archived_at", null)
        .order("due_day"),
      db().from("settings").select("loan_allocation_pct").maybeSingle(),
    ]).then(([bills, settings]) => {
      if (!live) return;
      setError(bills.error?.message ?? settings.error?.message);
      setInstalments(
        (bills.data ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          emoji: b.emoji ?? "🚗",
          amountCents: b.amount_cents,
        })),
      );
      setPct(settings.data?.loan_allocation_pct ?? 0);
    });
    return () => {
      live = false;
    };
  }, [db]);

  return { instalments, pct, setPct, error };
}

export function LoanRepaymentCard({
  accounts,
  totals,
  db = supabase,
  now,
  className,
  saveDelayMs = 600,
}: {
  accounts: Account[];
  totals: readonly MonthTotalsRow[];
  db?: () => Db;
  now?: Date;
  className?: string;
  saveDelayMs?: number;
}) {
  const { instalments, pct, setPct, error } = useLoanSettings(db);
  const [saveError, setSaveError] = useState<string>();
  const dirty = useRef(false);
  const sliderId = useId();

  // Save the share a moment after the slider stops moving.
  useEffect(() => {
    if (!dirty.current || pct === undefined) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      void db()
        .from("settings")
        .upsert({ loan_allocation_pct: pct }, { onConflict: "user_id" })
        .then(({ error }) => setSaveError(error ? `Could not save the share: ${error.message}` : undefined));
    }, saveDelayMs);
    return () => clearTimeout(timer);
  }, [db, pct, saveDelayMs]);

  const income = incomeBase(totals, now);
  const shortLoans = accounts
    .filter((a) => (a.kind === "loan" || a.kind === "card") && a.debt_term === "short")
    .map((a) => ({ id: a.account_id, name: a.name ?? "Loan", emoji: a.emoji ?? "💳", owedCents: owed(a) }));
  const plan = allocate(income.cents, pct ?? 0, instalments ?? [], shortLoans);

  return (
    <Card title="💸 Loan repayment" className={className} aria-label="Loan repayment">
      {error && (
        <p role="alert" className={styles.error}>
          Could not load the loan plan: {error}
        </p>
      )}
      {pct !== undefined && instalments && (
        <div className={styles.body}>
          <div className={styles.top}>
            <label htmlFor={sliderId} className={styles.base}>
              Of {income.label} income {formatAmount(income.cents)}
            </label>
            <span className={styles.share}>
              {pct}%<span className={styles.phoneInline}> · {formatAmount(plan.budgetCents)}</span>
            </span>
          </div>
          <input
            id={sliderId}
            className={styles.slider}
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            aria-valuetext={`${pct}%, ${formatAmount(plan.budgetCents)} a month`}
            onChange={(e) => {
              dirty.current = true;
              setPct(Number(e.target.value));
            }}
          />
          {plan.lines.length > 0 && (
            <ul className={styles.lines} aria-label="Split">
              {plan.lines.map((l) => (
                <li key={l.id} className={styles.line}>
                  <span aria-hidden="true">{l.emoji}</span>
                  <span className={styles.name}>{l.name}</span>
                  {STATE_LABEL[l.state] && (
                    <span className={`${styles.state} ${styles[l.state]}`}>{STATE_LABEL[l.state]}</span>
                  )}
                  <span className={styles.amount}>{formatAmount(l.cents)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.clear}>⏱ {clearText(plan)}</p>
          {saveError && (
            <p role="alert" className={styles.error}>
              {saveError}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
