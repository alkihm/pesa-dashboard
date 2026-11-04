import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { HeaderIconLink, PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { KpiCard } from "@/components/KpiCard";
import { Segmented } from "@/components/Segmented";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { summarise } from "@/lib/balances";
import { useAccounts } from "@/lib/data/accounts";
import { formatDay } from "@/lib/due";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { useBills, type BillRow } from "./data";
import { billStatus, billTotals, filterBills, nairobiMonth, sortBills, type BillFilter } from "./status";
import styles from "./Bills.module.css";

interface ScreenProps {
  db?: () => Db;
  now?: Date;
}

const FILTERS: { value: BillFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "to-pay", label: "To pay" },
  { value: "paid", label: "Paid" },
];

const LEGEND: { tone: Tone; label: string }[] = [
  { tone: "red", label: "Due / overdue" },
  { tone: "orange", label: "≤ 3 days" },
  { tone: "amber", label: "≤ 7 days" },
  { tone: "blue", label: "Later" },
  { tone: "green", label: "Paid" },
  { tone: "grey", label: "Skipped" },
];

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function useFilter() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("show");
  const filter: BillFilter = raw === "to-pay" || raw === "paid" ? raw : "all";
  const setFilter = (f: BillFilter) => setParams(f === "all" ? {} : { show: f }, { replace: true });
  return [filter, setFilter] as const;
}

// [3.1] Bills & budget: this month's bills with a colour from days to the due date, what to pay first at the top.
// Pay, skip and undo come with [3.3]; budget items with [3.4]; the "via SMS" mark is set by [3.2].
export function BillsScreen({ db = supabase, now }: ScreenProps) {
  const month = nairobiMonth(now);
  const { rows, error } = useBills(db, month);
  const { accounts } = useAccounts(db);
  const [filter, setFilter] = useFilter();

  const sorted = useMemo(() => sortBills(rows ?? []), [rows]);
  const totals = billTotals(sorted, summarise(accounts ?? []).availableCents);
  const shown = filterBills(sorted, filter);
  const title = monthName.format(new Date(`${month}T00:00:00Z`));

  const filters = (
    <Segmented variant="header" label="Show bills" options={FILTERS} value={filter} onChange={setFilter} />
  );

  return (
    <>
      <PageHeader
        title="Bills & budget"
        subtitle={
          <>
            {title}
            <span className={styles.desktopInline}> · colours follow each due date</span>
          </>
        }
        trailing={
          <HeaderIconLink to="/bills/new" label="Add bill">
            <Icon name="plus" />
          </HeaderIconLink>
        }
        actions={
          <Link to="/bills/new" className={styles.addButton}>
            <Icon name="plus" size={16} /> Add bill
          </Link>
        }
        controls={filters}
      />

      <div className={styles.page}>
        {error && (
          <p role="alert" className={styles.status}>
            Could not load bills: {error}
          </p>
        )}
        {!rows && !error && <p className={styles.status}>Loading…</p>}

        {rows && (
          <>
            <Totals totals={totals} available={accounts !== undefined} />
            <Legend />
            <Card title="🧾 Recurring bills" className={styles.billsCard}>
              <BillList rows={shown} filter={filter} empty={rows.length === 0} now={now} />
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function Totals({ totals: t, available }: { totals: ReturnType<typeof billTotals>; available: boolean }) {
  const left = available ? formatAmount(t.leftAfterPayingCents) : "…";
  return (
    <>
      {/* Phones: one hero card with the paid bar, as on the mobile board. */}
      <section aria-label="Bill totals" className={`${styles.hero} ${styles.phoneOnly}`}>
        <div className={styles.heroFigures}>
          <div>
            <span className={styles.heroLabel}>✅ Paid</span>
            <span className={styles.heroValue}>{formatAmount(t.paidCents)}</span>
          </div>
          <div>
            <span className={styles.heroLabel}>⏳ To pay</span>
            <span className={styles.heroValue}>{formatAmount(t.toPayCents)}</span>
          </div>
        </div>
        <span
          className={styles.heroTrack}
          role="meter"
          aria-label="Share of this month's bills paid"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(t.paidShare * 100)}
        >
          <span style={{ width: `${t.paidShare * 100}%` }} />
        </span>
        <div className={styles.heroFoot}>
          <span>Left after paying</span>
          <span className={styles.heroLeft}>{left}</span>
        </div>
      </section>

      {/* Desktop: four totals in a row. */}
      <section aria-label="Bill totals by status" className={`${styles.kpis} ${styles.desktopOnly}`}>
        <KpiCard label="To pay" value={formatAmount(t.toPayCents)} icon="bill" tone="hero" />
        <KpiCard label="Paid" value={formatAmount(t.paidCents)} icon="shield" />
        <KpiCard label="Skipped" value={formatAmount(t.skippedCents)} icon="list" />
        <KpiCard label="Left after paying" value={left} icon="wallet" />
      </section>
    </>
  );
}

function Legend() {
  return (
    <ul aria-label="Colour key" className={styles.legend}>
      {LEGEND.map((l) => (
        <li key={l.tone}>
          <span
            aria-hidden="true"
            className={styles.dot}
            style={{ background: `var(--tone-${l.tone}-dot)` }}
          />
          {l.label}
        </li>
      ))}
    </ul>
  );
}

const EMPTY: Record<BillFilter, string> = {
  all: "",
  "to-pay": "Nothing left to pay this month.",
  paid: "Nothing paid yet this month.",
};

function BillList({
  rows,
  filter,
  empty,
  now,
}: {
  rows: BillRow[];
  filter: BillFilter;
  empty: boolean;
  now?: Date;
}) {
  if (empty)
    return (
      <div className={styles.empty}>
        <p className={styles.status}>
          No bills yet. Add rent, power, internet and the rest to see what is due.
        </p>
        <Link to="/bills/new" className={styles.addLink}>
          ＋ Add bill
        </Link>
      </div>
    );

  return (
    <>
      {rows.length === 0 ? (
        <p className={styles.status}>{EMPTY[filter]}</p>
      ) : (
        <table className={styles.table}>
          <thead className={styles.desktopHead}>
            <tr>
              <th scope="col">Bill</th>
              <th scope="col">Due</th>
              <th scope="col" className={styles.num}>
                Amount
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BillLine key={r.id} row={r} now={now} />
            ))}
          </tbody>
        </table>
      )}
      <Link to="/bills/new" className={`${styles.addLink} ${styles.phoneOnly}`}>
        ＋ Add bill
      </Link>
    </>
  );
}

function BillLine({ row, now }: { row: BillRow; now?: Date }) {
  const s = billStatus(row, now);
  return (
    <tr className={styles.line}>
      <th scope="row" className={styles.who}>
        <span aria-hidden="true" className={styles.emoji}>
          {row.emoji}
        </span>
        <span className={styles.name}>{row.name}</span>
      </th>
      <td className={styles.due}>{formatDay(row.due_on)}</td>
      <td className={`${styles.amount} ${styles.num}`}>{formatAmount(row.amount_cents)}</td>
      <td className={styles.pill}>
        <StatusPill tone={s.tone}>{s.text}</StatusPill>
      </td>
    </tr>
  );
}
