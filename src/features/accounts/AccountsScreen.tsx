import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { HeaderIconLink, PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import { Icon } from "@/components/Icon";
import { KpiCard } from "@/components/KpiCard";
import { Segmented } from "@/components/Segmented";
import { StatusPill } from "@/components/StatusPill";
import { ViewAllLink } from "@/components/ViewAllLink";
import { summarise } from "@/lib/balances";
import { CATEGORY_COLOURS, categoryColourVar } from "@/lib/categoryColours";
import { useAccounts, type Account } from "@/lib/data/accounts";
import { formatAmount, formatCompact, formatKes } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import {
  balance,
  debtOf,
  debtRows,
  goalOf,
  isEveryday,
  isSavings,
  lockOf,
  matchStatus,
  owed,
  type DebtRow,
  type Goal,
  type Term,
} from "./accounts";
import { NewAccountCard } from "./new/NewAccountScreen";
import styles from "./Accounts.module.css";

interface ScreenProps {
  db?: () => Db;
  now?: Date;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function LoadState({ accounts, error }: { accounts?: Account[]; error?: string }) {
  if (error)
    return (
      <p role="alert" className={styles.status}>
        Could not load accounts: {error}
      </p>
    );
  if (!accounts) return <p className={styles.status}>Loading…</p>;
  return null;
}

function useTerm() {
  const [params, setParams] = useSearchParams();
  const term: Term = params.get("term") === "long" ? "long" : "short";
  const setTerm = (t: Term) => setParams(t === "long" ? { term: t } : {}, { replace: true });
  return [term, setTerm] as const;
}

// [2.3] Accounts: the four totals, everyday accounts with their SMS match, savings with the goal, and debt by term.
// Desktop keeps the New account form ([2.9]) in a side column; phones reach it from the header's plus.
export function AccountsScreen({ db = supabase, now }: ScreenProps) {
  const { accounts, error, reload } = useAccounts(db);
  const [term, setTerm] = useTerm();
  const all = accounts ?? [];
  const sum = summarise(all);
  const everyday = all.filter(isEveryday);
  const savings = all.filter(isSavings);
  const short = debtOf(all, "short");
  const long = debtOf(all, "long");
  const debtTotal = sum.shortDebtCents + sum.longDebtCents;

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={
          accounts
            ? `${plural(all.length, "account")} · net position ${formatKes(sum.netPositionCents)}`
            : undefined
        }
        back="/"
        trailing={
          <HeaderIconLink to="/accounts/new" label="New account">
            <Icon name="plus" />
          </HeaderIconLink>
        }
        actions={
          <Link to="/review" className={styles.headerButton}>
            🛡️ Reconcile
          </Link>
        }
      />

      <div className={styles.page}>
        <LoadState accounts={accounts} error={error} />

        {accounts && (
          <>
            <section aria-label="Totals" className={styles.kpis}>
              <KpiCard label="Available" value={formatAmount(sum.availableCents)} icon="wallet" tone="hero" />
              <KpiCard
                label="Savings"
                value={formatAmount(sum.savingsCents)}
                icon="chart"
                to="/accounts/savings"
              />
              <KpiCard
                label="Short-term debt"
                value={formatAmount(sum.shortDebtCents)}
                icon="bill"
                to="/accounts/debt"
              />
              <KpiCard
                label="Long-term debt"
                value={formatAmount(sum.longDebtCents)}
                icon="bill"
                to="/accounts/debt?term=long"
              />
            </section>

            <div className={styles.layout}>
              <div className={styles.main}>
                <Card title="💰 Everyday accounts">
                  {everyday.length ? (
                    <ul className={styles.tiles}>
                      {everyday.map((a) => (
                        <EverydayTile key={a.account_id} account={a} />
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.status}>No wallets, bank accounts or cash yet.</p>
                  )}
                </Card>

                <Card
                  title={`🐷 Savings · ${formatAmount(sum.savingsCents)}`}
                  action={<ViewAllLink to="/accounts/savings" />}
                >
                  <SavingsList savings={savings} total={sum.savingsCents} now={now} compact />
                </Card>

                <Card
                  className={styles.debtCard}
                  title={`💳 Debt · ${formatAmount(debtTotal)}`}
                  action={
                    <Segmented
                      variant="surface"
                      label="Debt group"
                      options={[
                        { value: "short", label: `⚡ Short-term · ${formatAmount(sum.shortDebtCents)}` },
                        { value: "long", label: `🚗 Long-term · ${formatCompact(sum.longDebtCents)}` },
                      ]}
                      value={term}
                      onChange={setTerm}
                    />
                  }
                >
                  <DebtList rows={debtRows(term === "short" ? short : long, now)} term={term} />
                </Card>

                <Link to="/accounts/new" className={`${styles.newLink} ${styles.phoneOnly}`}>
                  ＋ New account
                </Link>
              </div>

              <aside className={styles.desktopOnly}>
                <NewAccountCard db={db} onSaved={reload} />
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function EverydayTile({ account: a }: { account: Account }) {
  const status = matchStatus(a);
  return (
    <li className={`${styles.tile} ${status.tone === "red" ? styles.tileMismatch : ""}`}>
      <span aria-hidden="true" className={styles.tileEmoji}>
        {a.emoji ?? "💰"}
      </span>
      <span className={styles.muted}>{a.name}</span>
      <span className={styles.tileAmount}>{formatAmount(balance(a))}</span>
      <span className={`${styles.match} ${styles[status.tone]}`}>{status.text}</span>
    </li>
  );
}

function GoalBar({ goal, hero }: { goal: Goal; hero?: boolean }) {
  return (
    <div className={hero ? styles.goalHero : styles.goal}>
      <div className={styles.goalTop}>
        <span>🎯 {goal.label}</span>
        <span className={styles.goalPercent}>{goal.percent}%</span>
      </div>
      {hero && (
        <div className={styles.goalAmount}>
          {formatAmount(goal.savedCents)} <span>/ {formatAmount(goal.goalCents)}</span>
        </div>
      )}
      <span
        className={styles.goalTrack}
        role="meter"
        aria-label={`${goal.label}: ${formatAmount(goal.savedCents)} of ${formatAmount(goal.goalCents)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={goal.percent}
      >
        <span style={{ width: `${goal.fill * 100}%` }} />
      </span>
    </div>
  );
}

function SavingsList({
  savings,
  total,
  now,
  compact,
}: {
  savings: Account[];
  total: number;
  now?: Date;
  compact?: boolean;
}) {
  const goal = goalOf(savings);
  if (!savings.length) return <p className={styles.status}>No savings accounts yet.</p>;
  return (
    <div className={styles.savings}>
      {compact && goal && <GoalBar goal={goal} />}
      <ul className={styles.savingsGrid}>
        {savings.map((a, i) => {
          const lock = lockOf(a, now);
          const share = total > 0 ? Math.max(0, balance(a)) / total : 0;
          const colour = CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]!.key;
          return (
            <li key={a.account_id} className={styles.saving}>
              <span className={styles.row}>
                <EmojiTile emoji={a.emoji ?? "🐷"} colour={colour} />
                <span className={styles.rowText}>
                  <span className={styles.name}>{a.name}</span>
                  <span className={styles.muted}>{lock.text}</span>
                </span>
                <span className={styles.amount}>{formatAmount(balance(a))}</span>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span style={{ width: `${share * 100}%`, background: categoryColourVar(colour) }} />
              </span>
              <span className={`${styles.muted} ${styles.spread}`}>
                <span>{a.goal_cents ? `Goal ${formatAmount(a.goal_cents)}` : ""}</span>
                <span>{Math.round(share * 100)}% of savings</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DebtList({ rows, term }: { rows: DebtRow[]; term: Term }) {
  if (!rows.length) return <p className={styles.status}>No {term}-term loans or cards.</p>;
  return (
    <ul className={styles.debt} aria-label={term === "short" ? "Short-term debt" : "Long-term debt"}>
      {rows.map(({ account: a, owedCents, fill, progress, due }) => (
        <li key={a.account_id} className={styles.debtRow}>
          <span className={styles.row}>
            <EmojiTile emoji={a.emoji ?? (a.kind === "card" ? "💳" : "💸")} />
            <span className={styles.rowText}>
              <span className={styles.name}>{a.name}</span>
              <span className={`${styles.match} ${styles[matchStatus(a).tone]}`}>{matchStatus(a).text}</span>
            </span>
          </span>
          <span className={styles.debtProgress}>
            {fill !== undefined && (
              <span className={styles.track} aria-hidden="true">
                <span style={{ width: `${fill * 100}%`, background: "var(--tone-green-dot)" }} />
              </span>
            )}
            <span className={styles.muted}>{progress}</span>
          </span>
          <span className={styles.amount}>{formatAmount(owedCents)}</span>
          <span className={`${styles.due} ${due ? "" : styles.noDue}`}>
            {due ? (
              <StatusPill tone={due.tone}>{due.text}</StatusPill>
            ) : (
              <span className={styles.muted}>—</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

type SavingsFilter = "all" | "flex" | "locked";

// /accounts/savings, "Savings · view all": the goal, then each savings account with its lock and share.
export function SavingsScreen({ db = supabase, now }: ScreenProps) {
  const { accounts, error } = useAccounts(db);
  const [filter, setFilter] = useState<SavingsFilter>("all");
  const savings = useMemo(() => (accounts ?? []).filter(isSavings), [accounts]);
  const total = savings.reduce((t, a) => t + balance(a), 0);
  const shown = savings.filter((a) => filter === "all" || lockOf(a, now).locked === (filter === "locked"));
  const goal = goalOf(savings);

  return (
    <>
      <PageHeader
        title="🐷 Savings"
        subtitle={accounts ? `${plural(savings.length, "account")} · ${formatKes(total)}` : undefined}
        back="/accounts"
        trailing={
          <HeaderIconLink to="/accounts/new" label="Add savings account">
            <Icon name="plus" />
          </HeaderIconLink>
        }
        controls={
          <Segmented
            label="Show"
            options={[
              { value: "all", label: "All" },
              { value: "flex", label: "🔓 Flexible" },
              { value: "locked", label: "🔒 Locked" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        }
      />
      <div className={`${styles.page} ${styles.narrow}`}>
        <LoadState accounts={accounts} error={error} />
        {accounts && (
          <>
            {goal && <GoalBar goal={goal} hero />}
            <SavingsList savings={shown} total={total} now={now} />
            <Link to="/accounts/new" className={styles.newLink}>
              ＋ Add savings account
            </Link>
          </>
        )}
      </div>
    </>
  );
}

// /accounts/debt, "Debt · view all": short- or long-term loans and cards, soonest due first.
export function DebtScreen({ db = supabase, now }: ScreenProps) {
  const { accounts, error } = useAccounts(db);
  const [term, setTerm] = useTerm();
  const all = accounts ?? [];
  const debt = [...debtOf(all, "short"), ...debtOf(all, "long")];
  const rows = debtRows(debtOf(all, term), now);
  const owedIn = (list: Account[]) => list.reduce((t, a) => t + owed(a), 0);
  const nextDue = rows.find((r) => r.due);

  return (
    <>
      <PageHeader
        title="💳 Debt"
        subtitle={accounts ? `${plural(debt.length, "loan")} · ${formatKes(owedIn(debt))}` : undefined}
        back="/accounts"
        trailing={
          <HeaderIconLink to="/accounts/new" label="Add loan or card">
            <Icon name="plus" />
          </HeaderIconLink>
        }
        controls={
          <Segmented
            label="Debt group"
            options={[
              { value: "short", label: `Short-term · ${debtOf(all, "short").length}` },
              { value: "long", label: `Long-term · ${debtOf(all, "long").length}` },
            ]}
            value={term}
            onChange={setTerm}
          />
        }
      />
      <div className={`${styles.page} ${styles.narrow}`}>
        <LoadState accounts={accounts} error={error} />
        {accounts && (
          <>
            <section aria-label="Summary" className={styles.debtHero}>
              <span>{term === "short" ? "⚡ Short-term · mobile loans" : "🚗 Long-term · car and card"}</span>
              <span className={styles.debtHeroTotal}>{formatKes(owedIn(debtOf(all, term)))}</span>
              {nextDue?.due && (
                <span>
                  📅 Next due: {nextDue.account.name} · {nextDue.due.text.replace(/^Due /, "")}
                </span>
              )}
            </section>
            <DebtList rows={rows} term={term} />
            <Link to="/accounts/new" className={styles.newLink}>
              ＋ Add loan or card
            </Link>
          </>
        )}
      </div>
    </>
  );
}
