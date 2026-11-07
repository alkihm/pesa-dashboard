// [4.8] Month report: everything the one-page report shows for a month, worked out from the same totals as the Month
// screen ([2.4]) plus the balances at the month's end ([3.7], account_balances_at). Plain functions, tested on their
// own; the screen only lays the result out.

import {
  addMonths,
  compareCategories,
  highlights,
  kpis,
  monthShort,
  totalsFor,
  trend,
  type CategoryMonthRow,
  type Month,
  type MonthTotalsRow,
  type TrendMonth,
} from "@/features/month/month";
import { summarise, type AccountBalance } from "@/lib/balances";
import { categoryColourVar } from "@/lib/categoryColours";
import { formatAmount } from "@/lib/money";
import { budgetMonthRange } from "@/lib/budgetMonth";

/** A row of account_balances_at: the ledger of one account at the month's end. */
export interface BalanceAtRow {
  account_id: string;
  name: string;
  kind: string;
  debt_term: string | null;
  counts_in_net: boolean;
  archived_at: string | null;
  balance_cents: number;
}

export interface ReportBill {
  amount_cents: number;
  status: string;
}

export interface ReportInput {
  month: Month;
  totals: MonthTotalsRow[];
  categories: CategoryMonthRow[];
  bills: ReportBill[];
  balances: BalanceAtRow[];
  now?: Date;
}

export interface ReportKpi {
  key: string;
  label: string;
  cents: number;
  /** "▲ 1.7% vs Sep", or a note such as "Available − short-term debt". */
  note: string;
  hero?: boolean;
}

export interface ReportCategory {
  key: string;
  label: string;
  emoji: string;
  cents: number;
  /** Width of the share bar, 0–100, against the largest category. */
  share: number;
  colour: string;
  /** "+1,600", "−2,800" or "—" against last month. */
  change: string;
  tone: "more" | "less" | "same";
}

export interface ReportPosition {
  key: string;
  label: string;
  cents: number;
  total?: boolean;
}

export interface Report {
  month: Month;
  previous: Month;
  /** The month has not ended yet: the position is "today", not "at month end". */
  inProgress: boolean;
  kpis: ReportKpi[];
  highlights: string[];
  trend: TrendMonth[];
  position: ReportPosition[];
  categories: ReportCategory[];
  bills: { paid: number; due: number; skipped: number };
}

/** The moment a month ends: the first instant of the next month in Nairobi. */
/** The month's end: the next budget month's first moment ([4.9] month start day). */
export const monthEnd = (month: Month) => budgetMonthRange(month).to;

/** Rows shown in "Where the money went"; the rest are summed into "Other (n)". */
export const CATEGORY_ROWS = 8;

export function reportCategories(rows: CategoryMonthRow[], month: Month, previous: Month): ReportCategory[] {
  const colours = new Map(rows.map((r) => [r.category_id ?? "review", r.category?.colour ?? "cat-12"]));
  const all = compareCategories(rows, month, previous).filter((c) => c.current > 0);
  const shown = all.length > CATEGORY_ROWS + 1 ? all.slice(0, CATEGORY_ROWS) : all;
  const rest = all.slice(shown.length);
  const lines = shown.map((c) => ({
    key: c.key,
    label: c.label,
    emoji: c.emoji,
    current: c.current,
    diff: c.diff,
    colour: categoryColourVar(colours.get(c.key) ?? "cat-12"),
  }));
  if (rest.length)
    lines.push({
      key: "other",
      label: `Other (${rest.length})`,
      emoji: "📦",
      current: rest.reduce((t, c) => t + c.current, 0),
      diff: rest.reduce((t, c) => t + c.diff, 0),
      colour: categoryColourVar("cat-12"),
    });
  const largest = Math.max(1, ...lines.map((l) => l.current));
  return lines.map((l) => ({
    key: l.key,
    label: l.label,
    emoji: l.emoji,
    cents: l.current,
    share: Math.round((l.current / largest) * 1000) / 10,
    colour: l.colour,
    change: l.diff === 0 ? "—" : formatAmount(l.diff, { signed: true }),
    tone: l.diff > 0 ? "more" : l.diff < 0 ? "less" : "same",
  }));
}

/** The position from the balances at the month's end; accounts archived by then are left out. */
export function reportPosition(rows: BalanceAtRow[], month: Month): ReportPosition[] {
  const end = Date.parse(monthEnd(month));
  const live = rows.map(
    (r) =>
      ({
        ...r,
        archived_at: r.archived_at && Date.parse(r.archived_at) < end ? r.archived_at : null,
        snapshot_at: null,
        difference_cents: null,
      }) as unknown as AccountBalance,
  );
  const s = summarise(live);
  return [
    { key: "available", label: "💰 Available", cents: s.availableCents },
    { key: "savings", label: "🐷 Savings", cents: s.savingsCents },
    { key: "short", label: "⚡ Short-term debt", cents: -s.shortDebtCents },
    { key: "long", label: "🚗 Long-term debt", cents: -s.longDebtCents },
    { key: "net", label: "Net position", cents: s.netPositionCents, total: true },
    { key: "all", label: "After all debt", cents: s.afterAllDebtCents, total: true },
  ];
}

export function buildReport({
  month,
  totals,
  categories,
  bills,
  balances,
  now = new Date(),
}: ReportInput): Report {
  const previous = addMonths(month, -1);
  const current = totalsFor(totals, month);
  const before = totalsFor(totals, previous);
  const changes = compareCategories(categories, month, previous);
  const position = reportPosition(balances, month);
  const vs = ` vs ${monthShort(previous)}`;

  const cards: ReportKpi[] = kpis(current, before)
    .filter((k) => k.key === "income" || k.key === "spent" || k.key === "left")
    .map((k) => ({
      key: k.key,
      label: k.label,
      cents: k.cents,
      note: k.change ? `${k.change}${vs}` : `Nothing to compare in ${monthShort(previous)}`,
      hero: k.key === "income",
    }));
  cards.push({
    key: "net",
    label: "Net position",
    cents: position.find((p) => p.key === "net")!.cents,
    note: "Available + savings − short-term debt",
  });

  const sum = (status: string) =>
    bills.filter((b) => b.status === status).reduce((t, b) => t + b.amount_cents, 0);

  return {
    month,
    previous,
    inProgress: Date.parse(monthEnd(month)) > now.getTime(),
    kpis: cards,
    highlights: highlights(current, before, changes),
    trend: trend(totals, month),
    position,
    categories: reportCategories(categories, month, previous),
    bills: { paid: sum("paid"), due: sum("due"), skipped: sum("skipped") },
  };
}
