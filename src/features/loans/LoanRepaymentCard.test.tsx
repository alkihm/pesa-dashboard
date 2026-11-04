import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { BillsSummaryCard } from "@/features/bills/BillsSummaryCard";
import type { Account } from "@/lib/data/accounts";
import type { Db } from "@/lib/supabase";
import { incomeBase } from "./allocation";
import { LoanRepaymentCard } from "./LoanRepaymentCard";

const KES = 100;
const NOW = new Date("2026-10-31T09:00:00Z");

// Invented accounts and figures, as on the boards.
const loan = (id: string, name: string, emoji: string, owed: number, term: "short" | "long") =>
  ({
    account_id: id,
    name,
    emoji,
    kind: "loan",
    debt_term: term,
    balance_cents: -owed * KES,
    archived_at: null,
  }) as unknown as Account;
const accounts = [
  loan("fz", "Loan A", "⚡", 4_320, "short"),
  loan("ms", "Loan B", "📱", 7_500, "short"),
  loan("kc", "Loan C", "🏦", 12_000, "short"),
  loan("car", "Car loan", "🚗", 1_180_000, "long"),
];
const totals = [
  {
    month: "2026-10-01",
    income_cents: 198_400 * KES,
    spending_cents: 0,
    fees_cents: 0,
    repaid_cents: 0,
    saved_cents: 0,
  },
];

function fakeDb(pct: number | null = 25) {
  const writes: unknown[] = [];
  const data: Record<string, unknown> = {
    bills: [{ id: "car-bill", name: "Car loan", emoji: "🚗", amount_cents: 38_500 * KES, due_day: 5 }],
    settings: pct === null ? null : { loan_allocation_pct: pct },
  };
  const db = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: data[table] ?? null, error: null }).then(ok),
        upsert: (row: unknown, options: unknown) => {
          writes.push({ table, row, options });
          return builder;
        },
      };
      for (const op of ["select", "not", "is", "order", "maybeSingle"]) builder[op] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as Db, writes };
}

describe("incomeBase", () => {
  it("uses this month's income, or last month's while this month has none", () => {
    expect(incomeBase(totals, NOW)).toEqual({ cents: 198_400 * KES, label: "October" });
    expect(incomeBase(totals, new Date("2026-11-02T09:00:00Z"))).toEqual({
      cents: 198_400 * KES,
      label: "October",
    });
    expect(incomeBase([], NOW)).toEqual({ cents: 0, label: "September" });
  });
});

describe("LoanRepaymentCard", () => {
  it("shows the saved share, the split and the months to clear, as on the boards", async () => {
    const { db } = fakeDb(25);
    render(<LoanRepaymentCard accounts={accounts} totals={totals} db={() => db} now={NOW} />);
    expect(await screen.findByLabelText("Of October income 198,400")).toHaveValue("25");
    const split = screen.getByRole("list", { name: "Split" });
    const line = (name: string) => within(split).getByText(name).closest("li")!;
    expect(within(line("Car loan")).getByText("Paid")).toBeInTheDocument();
    expect(within(line("Car loan")).getByText("38,500")).toBeInTheDocument();
    expect(within(line("Loan A")).getByText("Cleared")).toBeInTheDocument();
    expect(within(line("Loan B")).getByText("Part")).toBeInTheDocument();
    expect(within(line("Loan B")).getByText("6,780")).toBeInTheDocument();
    expect(within(line("Loan C")).getByText("0")).toBeInTheDocument();
    expect(screen.getByText("⏱ Short-term loans clear in ~3 months")).toBeInTheDocument();
  });

  it("moves the split with the slider and saves the share once it stops", async () => {
    const { db, writes } = fakeDb(null);
    render(
      <LoanRepaymentCard accounts={accounts} totals={totals} db={() => db} now={NOW} saveDelayMs={10} />,
    );
    const slider = await screen.findByLabelText("Of October income 198,400");
    expect(slider).toHaveValue("0");
    fireEvent.change(slider, { target: { value: "50" } });
    expect(screen.getByText("⏱ Short-term loans clear this month")).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-valuetext", "50%, 99,200 a month");
    expect(writes).toEqual([]);
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(writes).toEqual([
      { table: "settings", row: { loan_allocation_pct: 50 }, options: { onConflict: "user_id" } },
    ]);
  });
});

describe("BillsSummaryCard", () => {
  it("shows paid, pending and what is left after pending", async () => {
    const rows = [
      {
        id: "1",
        bill_id: "b1",
        month: "2026-10-01",
        due_on: "2026-10-01",
        amount_cents: 45_000 * KES,
        status: "paid",
        paid_at: "2026-10-01T08:00:00Z",
        transaction_id: null,
        version: 1,
        bill: { name: "Rent", emoji: "🏠", account_id: null },
        paid_by: null,
      },
      {
        id: "2",
        bill_id: "b2",
        month: "2026-10-01",
        due_on: "2026-10-31",
        amount_cents: 2_600 * KES,
        status: "due",
        paid_at: null,
        transaction_id: null,
        version: 1,
        bill: { name: "Software", emoji: "🤖", account_id: null },
        paid_by: null,
      },
    ];
    const db = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: () => {
        const b: Record<string, unknown> = {
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
        };
        for (const op of ["select", "is", "or"]) b[op] = () => b;
        return b;
      },
    } as unknown as Db;
    render(
      <MemoryRouter>
        <BillsSummaryCard availableCents={40_000 * KES} db={() => db} now={NOW} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("45,000", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("2,600", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("37,400", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "95");
    const list = screen.getByRole("list", { name: "This month's bills" });
    expect(within(list).getByText("· due today", { exact: false })).toBeInTheDocument();
    expect(within(list).getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute("href", "/bills");
  });
});
