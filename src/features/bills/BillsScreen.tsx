import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { HeaderIconLink, PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
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
import { allowed, applyAction, canPayOrSkip, canUndo, sendBillAction, type BillAction } from "./actions";
import {
  canBudget,
  sendBudgetAction,
  setAsideCents,
  sortBudgetItems,
  useBudgetItems,
  type BudgetAction,
  type BudgetItem,
} from "./budget";
import { BudgetItemsCard, NewBudgetItemCard } from "./BudgetItems";
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
// [3.3] Pay, Skip and Undo change the row and the totals at once, and put it back if the database refuses.
// An SMS payment marks its month paid in the database ([3.2], D-015); that pill opens the payment and has no Undo.
// [3.4] Budget items: Approve sets an item's money aside (it leaves "Left after paying"); nothing moves.
export function BillsScreen({ db = supabase, now }: ScreenProps) {
  const month = nairobiMonth(now);
  const { rows, error, reload, replace } = useBills(db, month);
  const { accounts } = useAccounts(db);
  const [filter, setFilter] = useFilter();
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  async function act(row: BillRow, action: BillAction) {
    if (!allowed(row, action) || busy.has(row.id)) return;
    const at = now ?? new Date();
    setActionError(undefined);
    setBusy((b) => new Set(b).add(row.id));
    replace(applyAction(row, action, at));
    const result = await sendBillAction(db(), row, action, at);
    setBusy((b) => {
      const next = new Set(b);
      next.delete(row.id);
      return next;
    });
    if (result.ok) return replace({ ...applyAction(row, action, at), version: result.version });
    replace(row);
    setActionError(result.reason === "changed" ? result.message : `Could not save: ${result.message}`);
    if (result.reason === "changed") reload();
  }

  const budget = useBudgetItems(db, month);
  const [budgetBusy, setBudgetBusy] = useState<ReadonlySet<string>>(new Set());

  async function budgetAct(item: BudgetItem, action: BudgetAction) {
    if (!canBudget(item, action) || budgetBusy.has(item.id)) return;
    setActionError(undefined);
    setBudgetBusy((b) => new Set(b).add(item.id));
    budget.replace({ ...item, status: action === "approve" ? "approved" : "cancelled" });
    const result = await sendBudgetAction(db(), item, action, now ?? new Date());
    setBudgetBusy((b) => {
      const next = new Set(b);
      next.delete(item.id);
      return next;
    });
    if (!result.ok) {
      budget.replace(item);
      setActionError(result.message);
    }
    // Queued offline: keep what the screen shows; a reload would need the connection.
    if (!result.ok || !result.queued) budget.reload();
  }

  const sorted = useMemo(() => sortBills(rows ?? []), [rows]);
  const items = useMemo(
    () => sortBudgetItems((budget.items ?? []).filter((i) => i.status !== "cancelled")),
    [budget.items],
  );
  const setAside = setAsideCents(items);
  const totals = billTotals(sorted, summarise(accounts ?? []).availableCents - setAside);
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
            <Totals totals={totals} available={accounts !== undefined} setAside={setAside} />
            <Legend />
            {actionError && (
              <p role="alert" className={styles.actionError}>
                {actionError}
              </p>
            )}
            <div className={styles.layout}>
              <Card title="🧾 Recurring bills" className={styles.billsCard}>
                <BillList
                  rows={shown}
                  filter={filter}
                  empty={rows.length === 0}
                  now={now}
                  busy={busy}
                  onAction={(row, action) => void act(row, action)}
                />
              </Card>
              <aside className={styles.side} aria-label="Budget">
                {budget.error && (
                  <p role="alert" className={styles.status}>
                    Could not load budget items: {budget.error}
                  </p>
                )}
                {budget.items && (
                  <BudgetItemsCard
                    items={items}
                    busy={budgetBusy}
                    onAction={(item, action) => void budgetAct(item, action)}
                  />
                )}
                <div className={styles.desktopOnly}>
                  <NewBudgetItemCard db={db} now={now} onSaved={budget.reload} />
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Totals({
  totals: t,
  available,
  setAside,
}: {
  totals: ReturnType<typeof billTotals>;
  available: boolean;
  setAside: number;
}) {
  const left = available ? formatAmount(t.leftAfterPayingCents) : "…";
  const leftNote = setAside > 0 ? `after ${formatAmount(setAside)} approved for budget items` : undefined;
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
        {leftNote && <p className={styles.heroNote}>{leftNote}</p>}
      </section>

      {/* Desktop: four totals in a row. */}
      <section aria-label="Bill totals by status" className={`${styles.kpis} ${styles.desktopOnly}`}>
        <KpiCard label="To pay" value={formatAmount(t.toPayCents)} icon="bill" tone="hero" />
        <KpiCard label="Paid" value={formatAmount(t.paidCents)} icon="shield" />
        <KpiCard label="Skipped" value={formatAmount(t.skippedCents)} icon="list" />
        <KpiCard label="Left after paying" value={left} sub={leftNote} icon="wallet" />
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
  busy,
  onAction,
}: {
  rows: BillRow[];
  filter: BillFilter;
  empty: boolean;
  now?: Date;
  busy: ReadonlySet<string>;
  onAction: (row: BillRow, action: BillAction) => void;
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
              <th scope="col" className={styles.num}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BillLine key={r.id} row={r} now={now} busy={busy.has(r.id)} onAction={onAction} />
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

function BillLine({
  row,
  now,
  busy,
  onAction,
}: {
  row: BillRow;
  now?: Date;
  busy: boolean;
  onAction: (row: BillRow, action: BillAction) => void;
}) {
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
        {row.viaSms && row.transactionId ? (
          <Link
            to={`/activity/${row.transactionId}`}
            className={styles.pillLink}
            aria-label={`${s.text}: open the payment`}
          >
            <StatusPill tone={s.tone}>{s.text}</StatusPill>
          </Link>
        ) : (
          <StatusPill tone={s.tone}>{s.text}</StatusPill>
        )}
      </td>
      <td className={styles.actions}>
        {canPayOrSkip(row) && (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Skip ${row.name}, due ${formatDay(row.due_on)}`}
              disabled={busy}
              onClick={() => onAction(row, "skip")}
            >
              Skip
            </Button>
            <Button
              size="sm"
              aria-label={`Pay ${row.name}, due ${formatDay(row.due_on)}`}
              disabled={busy}
              onClick={() => onAction(row, "pay")}
            >
              Pay
            </Button>
          </>
        )}
        {canUndo(row) && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Undo ${row.name}, due ${formatDay(row.due_on)}`}
            disabled={busy}
            onClick={() => onAction(row, "undo")}
          >
            Undo
          </Button>
        )}
      </td>
    </tr>
  );
}
