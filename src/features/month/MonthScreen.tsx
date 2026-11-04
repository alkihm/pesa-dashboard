import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { HeaderIconLink, PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { BarChart } from "@/components/charts/BarChart";
import { EmojiTile } from "@/components/EmojiTile";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { TransactionList, TransactionTable } from "@/features/activity/TransactionList";
import { supabase, type Db } from "@/lib/supabase";
import { formatAmount, formatCompact } from "@/lib/money";
import { useMonthData, useMonthTransactions } from "./data";
import {
  addMonths,
  compareCategories,
  currentMonth,
  highlights,
  kpis,
  monthName,
  monthParam,
  monthShort,
  monthTitle,
  parseMonth,
  totalsFor,
  trend,
  type CategoryChange,
  type Kpi,
  type Month,
} from "./month";
import styles from "./MonthScreen.module.css";

type Tab = "overview" | "compare";
const TABS = [
  { value: "overview" as const, label: "📅 Overview" },
  { value: "compare" as const, label: "⚖️ Compare" },
];
const CATEGORY_ROWS = 8;

const monthLink = (month: Month) => `/month?m=${monthParam(month)}`;

// [2.4] One month against the one before: totals, the last 6 months, categories, and the month's transactions.
// Desktop shows everything; phones split Overview and Compare, and open the transactions on request.
export function MonthScreen({ db = supabase, now }: { db?: () => Db; now?: Date }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const thisMonth = currentMonth(now);
  const month = parseMonth(params.get("m")) ?? thisMonth;
  const previous = addMonths(month, -1);
  const [tab, setTab] = useState<Tab>("overview");
  const [showList, setShowList] = useState(false);

  const { data, error } = useMonthData(month, db);
  const transactions = useMonthTransactions(month, db);

  const view = useMemo(() => {
    if (!data) return undefined;
    const current = totalsFor(data.totals, month);
    const before = totalsFor(data.totals, previous);
    const categories = compareCategories(data.categories, month, previous);
    return {
      kpis: kpis(current, before),
      trend: trend(data.totals, month),
      categories,
      highlights: highlights(current, before, categories),
    };
  }, [data, month, previous]);

  const isLatest = month >= thisMonth;
  const prevLink = (
    <HeaderIconLink to={monthLink(previous)} label="Previous month">
      <Icon name="back" />
    </HeaderIconLink>
  );
  const nextLink = isLatest ? (
    <span className={styles.slot} />
  ) : (
    <HeaderIconLink to={monthLink(addMonths(month, 1))} label="Next month">
      <span className={styles.flip}>
        <Icon name="back" />
      </span>
    </HeaderIconLink>
  );
  const picker = (
    <input
      type="month"
      aria-label="Choose month"
      className={styles.picker}
      value={monthParam(month)}
      max={monthParam(thisMonth)}
      onChange={(e) => parseMonth(e.target.value) && navigate(monthLink(parseMonth(e.target.value)!))}
    />
  );
  const open = (id: string) => navigate(`/activity/${id}`);

  return (
    <>
      <PageHeader
        title={monthTitle(month)}
        subtitle={`vs ${monthName(previous)}`}
        leading={prevLink}
        trailing={nextLink}
        controls={
          <div className={styles.phoneOnly}>
            <Segmented label="View" options={TABS} value={tab} onChange={setTab} />
          </div>
        }
        actions={
          <div className={styles.actions}>
            {prevLink}
            {picker}
            {nextLink}
            <Link to={`/report?m=${monthParam(month)}`} className={styles.headerLink}>
              📄 Report
            </Link>
          </div>
        }
      />

      <div className={styles.page} data-tab={tab}>
        {error && (
          <p role="alert" className={styles.status}>
            Could not load the month: {error}
          </p>
        )}

        <div className={`${styles.kpis} ${styles.overview}`} aria-busy={!view}>
          {(view?.kpis ?? placeholders).map((k) => (
            <KpiTile key={k.key} kpi={k} previous={monthShort(previous)} loading={!view} />
          ))}
        </div>

        <div className={styles.charts}>
          <Card title="Last 6 months" className={styles.overview}>
            {view && (
              <BarChart
                title={`Income and spending, ${monthShort(view.trend[0]!.month)} to ${monthShort(month)}`}
                categories={view.trend.map((m) => m.label)}
                series={[
                  { key: "income", label: "Income", colour: "var(--color-income)" },
                  { key: "spending", label: "Expense", colour: "var(--color-expense)" },
                ]}
                values={[view.trend.map((m) => m.income), view.trend.map((m) => m.spending)]}
                notes={view.trend.map((m) =>
                  m.income || m.spending
                    ? {
                        text: `${m.net > 0 ? "+" : ""}${formatCompact(m.net)}`,
                        tone: m.net >= 0 ? "good" : "bad",
                      }
                    : { text: "" },
                )}
                formatValue={(v) => formatAmount(v)}
                formatTick={formatCompact}
                height={180}
              />
            )}
          </Card>

          <Card title="Categories vs last month" className={styles.compare}>
            {view && (
              <CategoryBars
                categories={view.categories}
                current={monthShort(month)}
                previous={monthShort(previous)}
              />
            )}
          </Card>
        </div>

        {view && (
          <Card title="This month" className={`${styles.phoneOnly} ${styles.overview}`}>
            <ul className={styles.highlights}>
              {view.highlights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Card>
        )}

        <Link to={`/report?m=${monthParam(month)}`} className={`${styles.reportButton} ${styles.phoneOnly}`}>
          📄 Month report
        </Link>
        <button
          type="button"
          className={`${styles.listButton} ${styles.phoneOnly}`}
          aria-expanded={showList}
          onClick={() => setShowList((s) => !s)}
        >
          {showList ? "Hide" : "See all"} {monthName(month)} transactions
        </button>

        <section
          aria-labelledby="month-transactions"
          className={showList ? `${styles.transactions} ${styles.listOpen}` : styles.transactions}
        >
          <h2 id="month-transactions" className={styles.heading}>
            Transactions
          </h2>
          {transactions.error && (
            <p role="alert" className={styles.status}>
              Could not load transactions: {transactions.error}
            </p>
          )}
          {!transactions.loading && !transactions.error && transactions.rows.length === 0 && (
            <p className={styles.status}>No transactions in {monthName(month)}.</p>
          )}
          {transactions.rows.length > 0 && (
            <>
              <div className={styles.phoneOnly}>
                <TransactionList
                  rows={transactions.rows}
                  label={`${monthName(month)} transactions`}
                  onToggle={open}
                />
              </div>
              <div className={styles.desktopOnly}>
                <TransactionTable
                  rows={transactions.rows}
                  label={`${monthName(month)} transactions`}
                  onToggle={open}
                />
              </div>
            </>
          )}
          {transactions.hasMore && (
            <button
              type="button"
              className={styles.moreButton}
              onClick={transactions.loadMore}
              disabled={transactions.loading}
            >
              {transactions.loading ? "Loading…" : "Show more"}
            </button>
          )}
        </section>
      </div>
    </>
  );
}

const placeholders: Kpi[] = [
  { key: "income", label: "Income", emoji: "💰", cents: 0, change: null, tone: "neutral" },
  { key: "spent", label: "Spent", emoji: "🛒", cents: 0, change: null, tone: "neutral" },
  { key: "left", label: "Left over", emoji: "🟢", cents: 0, change: null, tone: "neutral" },
  { key: "repaid", label: "Loans repaid", emoji: "💸", cents: 0, change: null, tone: "neutral" },
  { key: "fees", label: "Fees", emoji: "🧾", cents: 0, change: null, tone: "neutral" },
];

function KpiTile({ kpi, previous, loading }: { kpi: Kpi; previous: string; loading: boolean }) {
  const toneClass = kpi.tone === "good" ? styles.good : kpi.tone === "bad" ? styles.bad : styles.neutral;
  return (
    <div className={kpi.key === "repaid" ? `${styles.kpi} ${styles.desktopKpi}` : styles.kpi}>
      <EmojiTile emoji={kpi.emoji} />
      <div className={styles.kpiText}>
        <span className={styles.kpiLabel}>{kpi.label}</span>
        <span className={styles.kpiValue}>{loading ? "…" : formatAmount(kpi.cents)}</span>
        {kpi.change && (
          <span className={`${styles.kpiChange} ${toneClass}`}>
            {kpi.change}
            <span className={styles.vs}> vs {previous}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function CategoryBars({
  categories,
  current,
  previous,
}: {
  categories: CategoryChange[];
  current: string;
  previous: string;
}) {
  if (categories.length === 0) return <p className={styles.status}>No spending in either month.</p>;
  const shown = categories.slice(0, CATEGORY_ROWS);
  const top = Math.max(...shown.map((c) => Math.max(c.current, c.previous)));
  const width = (cents: number) => `${top ? (cents / top) * 100 : 0}%`;

  return (
    <>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <span className={`${styles.swatch} ${styles.now}`} /> {current}
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.before}`} /> {previous}
        </span>
      </div>
      <ul className={styles.categoryList} aria-label={`Spending by category, ${current} and ${previous}`}>
        {shown.map((c) => (
          <li key={c.key} className={styles.categoryRow}>
            <span className={styles.categoryText}>
              <span className={styles.categoryName}>
                <span aria-hidden="true">{c.emoji}</span> {c.label}
              </span>
              {c.budget.tone !== "none" && (
                <span className={`${styles.budget} ${styles[`budget-${c.budget.tone}`]}`}>
                  {c.budget.text}
                </span>
              )}
            </span>
            <span className={styles.bars} aria-hidden="true">
              <span className={`${styles.bar} ${styles.now}`} style={{ width: width(c.current) }} />
              <span className={`${styles.bar} ${styles.before}`} style={{ width: width(c.previous) }} />
            </span>
            <span
              className={`${styles.diff} ${c.diff > 0 ? styles.bad : c.diff < 0 ? styles.good : styles.neutral}`}
            >
              {c.diff === 0 ? "—" : formatAmount(c.diff, { signed: true })}
            </span>
            <span className="visually-hidden">
              {formatAmount(c.current)} in {current}, {formatAmount(c.previous)} in {previous}
            </span>
          </li>
        ))}
      </ul>
      {categories.length > CATEGORY_ROWS && (
        <p className={styles.more}>and {categories.length - CATEGORY_ROWS} more</p>
      )}
    </>
  );
}
