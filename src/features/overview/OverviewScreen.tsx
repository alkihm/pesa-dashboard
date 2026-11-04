import { useState } from "react";
import { Link } from "react-router";

import { HeaderIconLink, PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { Donut } from "@/components/charts/Donut";
import { LineChart } from "@/components/charts/LineChart";
import { EmojiTile } from "@/components/EmojiTile";
import { Icon } from "@/components/Icon";
import { KpiCard } from "@/components/KpiCard";
import { Segmented } from "@/components/Segmented";
import { StatusPill } from "@/components/StatusPill";
import { ViewAllLink } from "@/components/ViewAllLink";
import {
  balance,
  debtOf,
  debtRows,
  goalOf,
  isEveryday,
  isSavings,
  matchStatus,
} from "@/features/accounts/accounts";
import { BillsSummaryCard } from "@/features/bills/BillsSummaryCard";
import { LoanRepaymentCard } from "@/features/loans/LoanRepaymentCard";
import { currentMonth, leftOver, monthName, totalsFor, trend } from "@/features/month/month";
import { summarise } from "@/lib/balances";
import { CATEGORY_COLOURS, categoryColourVar } from "@/lib/categoryColours";
import { useAccounts, type Account } from "@/lib/data/accounts";
import { formatAmount, formatCompact } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { useOverviewData } from "./data";
import { periodLabel, spendingSlices, type Period } from "./overview";
import styles from "./Overview.module.css";

const today = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Nairobi",
});

/** How many debts Home lists before "View all". */
const DEBT_ROWS = 4;

// [2.2] Overview (desktop) and Home (phone): the headline totals ([3.7]), accounts with their SMS match, savings,
// debt, the twelve-month trend and where the money went in the chosen period. The cards follow the phone order;
// on desktop a grid places them as on the Overview board. The Bills card and the loan slider come from the bills
// epic (src/features/bills, src/features/loans, [3.1]/[3.5]).
export function OverviewScreen({ db = supabase, now }: { db?: () => Db; now?: Date }) {
  const [period, setPeriod] = useState<Period>("month");
  const { accounts, error: accountsError } = useAccounts(db);
  const { data, error: dataError } = useOverviewData(period, db, now);
  const error = accountsError ?? dataError;
  const all = accounts ?? [];
  const sum = summarise(all);
  const mismatched = sum.mismatched.length;

  return (
    <>
      <PageHeader
        title="Overview"
        phoneTitle="Budget"
        subtitle={today.format(now ?? new Date())}
        leading={
          <HeaderIconLink to="/settings" label="Settings">
            <Icon name="gear" />
          </HeaderIconLink>
        }
        trailing={
          <HeaderIconLink to="/review" label={mismatched ? `Review · ${mismatched} to reconcile` : "Review"}>
            <Icon name="shield" />
            {mismatched > 0 && <span className={styles.badgeDot} aria-hidden="true" />}
          </HeaderIconLink>
        }
        actions={
          <div className={styles.actions}>
            {mismatched > 0 && (
              <Link to="/review" className={styles.reconcile}>
                <span aria-hidden="true" className={styles.reconcileDot} />
                {mismatched} to reconcile
              </Link>
            )}
            <Link to="/report" className={styles.report}>
              ⤓ Report
            </Link>
          </div>
        }
        controls={
          <Segmented
            label="Period"
            options={[
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
              { value: "all", label: "All" },
            ]}
            value={period}
            onChange={setPeriod}
          />
        }
      />

      <div className={styles.page}>
        {error && (
          <p role="alert" className={styles.status}>
            Could not load the overview: {error}
          </p>
        )}
        {!accounts && !error && <p className={styles.status}>Loading…</p>}

        {accounts && (
          <div className={styles.grid}>
            <section aria-label="Totals" className={styles.totals}>
              <div className={styles.hero}>
                <span className={styles.heroLabel}>⚖️ Net position</span>
                <span className={styles.heroValue}>
                  <span className={styles.phoneOnly}>KES </span>
                  {formatAmount(sum.netPositionCents)}
                </span>
                <span className={`${styles.heroSub} ${styles.desktopOnly}`}>
                  Available + savings − short-term debt
                </span>
                <div className={`${styles.heroTiles} ${styles.phoneOnly}`}>
                  <Link to="/accounts" className={styles.heroTile}>
                    <span>💰 Available</span>
                    <b>{formatAmount(sum.availableCents)}</b>
                  </Link>
                  <Link to="/accounts/debt" className={styles.heroTile}>
                    <span>⚡ Short-term debt</span>
                    <b>{formatAmount(-sum.shortDebtCents)}</b>
                  </Link>
                </div>
              </div>
              <div className={styles.desktopKpis}>
                <KpiCard
                  label="Available"
                  value={formatAmount(sum.availableCents)}
                  sub={`${all.filter(isEveryday).length} accounts`}
                  icon="wallet"
                  to="/accounts"
                />
                <KpiCard
                  label="Debt"
                  value={formatAmount(sum.shortDebtCents + sum.longDebtCents)}
                  sub={`Short ${formatAmount(sum.shortDebtCents)} · Long ${formatCompact(sum.longDebtCents)}`}
                  icon="bill"
                  to="/accounts/debt"
                />
                <KpiCard
                  label="Savings"
                  value={formatAmount(sum.savingsCents)}
                  sub={`${all.filter(isSavings).length} accounts`}
                  icon="chart"
                  to="/accounts/savings"
                />
              </div>
            </section>

            <AccountsCard accounts={all.filter(isEveryday)} />
            <SavingsCard savings={all.filter(isSavings)} total={sum.savingsCents} />
            <SpendingCard period={period} data={data} now={now} />
            <TrendCard data={data} now={now} />
            <BillsSummaryCard
              availableCents={sum.availableCents}
              db={db}
              now={now}
              className={styles.bills}
            />
            <DebtCard accounts={all} now={now} />
            <LoanRepaymentCard
              accounts={all}
              totals={data?.totals ?? []}
              db={db}
              now={now}
              className={styles.loan}
            />
          </div>
        )}
      </div>
    </>
  );
}

function AccountsCard({ accounts }: { accounts: Account[] }) {
  return (
    <Card
      title="Accounts"
      action={<ViewAllLink to="/review">Reconcile</ViewAllLink>}
      className={styles.accounts}
    >
      {accounts.length ? (
        <ul className={styles.accountList}>
          {accounts.map((a) => {
            const status = matchStatus(a);
            return (
              <li key={a.account_id}>
                <Link to="/accounts" className={styles.account}>
                  <EmojiTile emoji={a.emoji ?? "💰"} />
                  <span className={styles.accountText}>
                    <span className={styles.name}>{a.name}</span>
                    <span className={`${styles.match} ${styles[status.tone]}`}>{status.text}</span>
                  </span>
                  <span className={styles.amount}>{formatAmount(balance(a))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.status}>
          No accounts yet. <Link to="/accounts/new">Add one</Link>
        </p>
      )}
    </Card>
  );
}

function SavingsCard({ savings, total }: { savings: Account[]; total: number }) {
  const goal = goalOf(savings);
  const top = Math.max(1, ...savings.map((a) => balance(a)));
  return (
    <Card
      title={`🐷 Savings · ${formatAmount(total)}`}
      action={
        goal ? (
          <span className={styles.muted}>
            Goal {formatCompact(goal.goalCents)} · {goal.percent}%
          </span>
        ) : undefined
      }
      className={styles.savings}
    >
      {savings.length ? (
        <>
          <ul className={styles.bars} aria-label="Savings by account">
            {savings.map((a, i) => {
              const colour = CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]!.key;
              return (
                <li key={a.account_id} className={styles.barItem}>
                  <span className={styles.barValue}>{formatCompact(balance(a))}</span>
                  <span className={styles.barTrack}>
                    <span
                      style={{
                        height: `${(Math.max(0, balance(a)) / top) * 100}%`,
                        background: categoryColourVar(colour),
                      }}
                    />
                  </span>
                  <span className={styles.barLabel}>
                    <span aria-hidden="true">{a.emoji ?? "🐷"}</span> {a.name}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link to="/accounts/savings" className={styles.viewAll}>
            View all {savings.length} ›
          </Link>
        </>
      ) : (
        <p className={styles.status}>No savings accounts yet.</p>
      )}
    </Card>
  );
}

function SpendingCard({
  period,
  data,
  now,
}: {
  period: Period;
  data: ReturnType<typeof useOverviewData>["data"];
  now?: Date;
}) {
  const slices = data ? spendingSlices(data.categories) : [];
  const total = slices.reduce((t, s) => t + s.value, 0);
  const label = periodLabel(period, now);
  return (
    <Card
      title="Where the money went"
      action={<ViewAllLink to="/categories">All</ViewAllLink>}
      className={styles.spending}
    >
      {!data ? (
        <p className={styles.status}>Loading…</p>
      ) : slices.length ? (
        <Donut
          title={`${label} spending by category`}
          slices={slices}
          centerValue={formatCompact(total)}
          centerLabel="spent"
          formatValue={formatAmount}
          maxSlices={9}
        />
      ) : (
        <p className={styles.status}>No spending in {label}.</p>
      )}
    </Card>
  );
}

function TrendCard({ data, now }: { data: ReturnType<typeof useOverviewData>["data"]; now?: Date }) {
  const month = currentMonth(now);
  const months = data ? trend(data.totals, month, 12) : [];
  const thisMonth = data ? totalsFor(data.totals, month) : undefined;
  const left = thisMonth ? leftOver(thisMonth) : 0;
  return (
    <Card
      title={`📅 ${monthName(month)} · income vs expense`}
      action={<ViewAllLink to="/month">Compare</ViewAllLink>}
      className={styles.trend}
    >
      {thisMonth && (
        <dl className={styles.figures}>
          <div>
            <dt>Income</dt>
            <dd className={styles.income}>{formatCompact(thisMonth.income)}</dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd className={styles.expense}>{formatCompact(thisMonth.spending)}</dd>
          </div>
          <div>
            <dt>Left</dt>
            <dd>
              {left > 0 ? "+" : ""}
              {formatCompact(left)}
            </dd>
          </div>
        </dl>
      )}
      {data && (
        <LineChart
          title={`Income and expense, ${months[0]?.label} to ${months.at(-1)?.label}`}
          categories={months.map((m) => m.label)}
          series={[
            { key: "income", label: "Income", colour: "var(--color-income)" },
            { key: "spending", label: "Expense", colour: "var(--color-expense)" },
          ]}
          values={[months.map((m) => m.income), months.map((m) => m.spending)]}
          formatValue={formatAmount}
          formatTick={formatCompact}
          height={200}
        />
      )}
    </Card>
  );
}

function DebtCard({ accounts, now }: { accounts: Account[]; now?: Date }) {
  const [term, setTerm] = useState<"short" | "long">("short");
  const short = debtOf(accounts, "short");
  const long = debtOf(accounts, "long");
  const owed = (list: Account[]) => list.reduce((t, a) => t + Math.max(0, -balance(a)), 0);
  const list = term === "short" ? short : long;
  const rows = debtRows(list, now).slice(0, DEBT_ROWS);
  return (
    <Card title={`💳 Debt · ${formatAmount(owed(short) + owed(long))}`} className={styles.debt}>
      <Segmented
        variant="surface"
        label="Debt group"
        options={[
          { value: "short", label: `Short · ${formatAmount(owed(short))}` },
          { value: "long", label: `Long · ${formatCompact(owed(long))}` },
        ]}
        value={term}
        onChange={setTerm}
      />
      {rows.length ? (
        <ul className={styles.debtList}>
          {rows.map(({ account: a, owedCents, due }) => (
            <li key={a.account_id} className={styles.debtRow}>
              <EmojiTile emoji={a.emoji ?? (a.kind === "card" ? "💳" : "💸")} />
              <span className={styles.accountText}>
                <span className={styles.name}>{a.name}</span>
                {due && <StatusPill tone={due.tone}>{due.text}</StatusPill>}
              </span>
              <span className={styles.amount}>{formatAmount(owedCents)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.status}>No {term}-term loans or cards.</p>
      )}
      <Link to={term === "long" ? "/accounts/debt?term=long" : "/accounts/debt"} className={styles.viewAll}>
        View all {list.length} ›
      </Link>
    </Card>
  );
}
