import { describe, expect, it } from "vitest";

import { billStatus, billTotals, filterBills, nairobiMonth, sortBills, type BillMonthLike } from "./status";

const KES = 100;
// 3 Nov 2026, 12:00 in Nairobi.
const NOW = new Date("2026-11-03T09:00:00Z");
const due = (due_on: string, amount = 1_000): BillMonthLike => ({
  due_on,
  amount_cents: amount * KES,
  status: "due",
});

describe("billStatus", () => {
  it.each([
    ["2026-11-01", "red", "Overdue · 2 days", -2],
    ["2026-11-02", "red", "Overdue · 1 day", -1],
    ["2026-11-03", "red", "Due today", 0],
    ["2026-11-04", "orange", "Due in 1 day", 1],
    ["2026-11-06", "orange", "Due in 3 days", 3],
    ["2026-11-07", "amber", "Due in 4 days", 4],
    ["2026-11-10", "amber", "Due in 7 days", 7],
    ["2026-11-11", "blue", "Due 11 Nov", 8],
    ["2026-11-30", "blue", "Due 30 Nov", 27],
  ])("a bill due %s is %s: %s", (on, tone, text, days) => {
    expect(billStatus(due(on), NOW)).toEqual({ tone, text, days });
  });

  it("paid is green whatever the date, and says when an SMS paid it", () => {
    expect(billStatus({ ...due("2026-10-01"), status: "paid" }, NOW)).toEqual({
      tone: "green",
      text: "✓ Paid",
      days: null,
    });
    expect(billStatus({ ...due("2026-11-20"), status: "paid", viaSms: true }, NOW).text).toBe(
      "✓ Paid · via SMS",
    );
  });

  it("skipped is grey whatever the date", () => {
    expect(billStatus({ ...due("2026-10-01"), status: "skipped" }, NOW)).toEqual({
      tone: "grey",
      text: "Skipped",
      days: null,
    });
  });

  describe("across month ends (days are counted in Nairobi time)", () => {
    it("a bill due on the 30th is overdue once Nairobi reaches 1 Dec, even while UTC is still on 30 Nov", () => {
      const nairobiMidnight = new Date("2026-11-30T21:30:00Z"); // 1 Dec, 00:30 in Nairobi
      expect(billStatus(due("2026-11-30"), nairobiMidnight)).toMatchObject({
        text: "Overdue · 1 day",
        tone: "red",
      });
      expect(billStatus(due("2026-12-01"), nairobiMidnight)).toMatchObject({
        text: "Due today",
        tone: "red",
      });
    });

    it("late evening in UTC is still the same Nairobi day until 21:00 UTC", () => {
      const late = new Date("2026-11-30T20:59:00Z"); // 30 Nov, 23:59 in Nairobi
      expect(billStatus(due("2026-11-30"), late).text).toBe("Due today");
      expect(billStatus(due("2026-12-01"), late)).toMatchObject({ text: "Due in 1 day", tone: "orange" });
    });

    it("counts over the year end", () => {
      const newYearsEve = new Date("2026-12-31T09:00:00Z");
      expect(billStatus(due("2027-01-03"), newYearsEve)).toMatchObject({
        text: "Due in 3 days",
        tone: "orange",
      });
      expect(billStatus(due("2026-12-24"), new Date("2027-01-02T09:00:00Z"))).toMatchObject({
        text: "Overdue · 9 days",
        tone: "red",
      });
    });

    it("counts over February in common and leap years", () => {
      expect(billStatus(due("2027-03-01"), new Date("2027-02-26T09:00:00Z")).text).toBe("Due in 3 days");
      expect(billStatus(due("2028-03-01"), new Date("2028-02-26T09:00:00Z")).text).toBe("Due in 4 days");
      // A due day of 31 is clamped to 28 Feb by ensure_bill_months; it is "today" on the 28th.
      expect(billStatus(due("2027-02-28"), new Date("2027-02-28T09:00:00Z")).text).toBe("Due today");
    });

    it("last month's unpaid bill stays overdue into the new month", () => {
      expect(billStatus(due("2026-10-28"), NOW)).toMatchObject({ text: "Overdue · 6 days", tone: "red" });
    });
  });
});

describe("sortBills", () => {
  it("puts what to pay first: unpaid by due date, then paid, then skipped", () => {
    const rows = [
      { ...due("2026-11-01"), name: "Rent", status: "paid" as const },
      { ...due("2026-11-15"), name: "TV" },
      { ...due("2026-11-20"), name: "Gym", status: "skipped" as const },
      { ...due("2026-11-01"), name: "Streaming" },
      { ...due("2026-10-28"), name: "Last month" },
      { ...due("2026-11-05"), name: "Car loan" },
    ];
    expect(sortBills(rows).map((r) => r.name)).toEqual([
      "Last month",
      "Streaming",
      "Car loan",
      "TV",
      "Rent",
      "Gym",
    ]);
  });

  it("breaks ties by amount, then name", () => {
    const rows = [
      { ...due("2026-11-05", 100), name: "B" },
      { ...due("2026-11-05", 500), name: "Z" },
      { ...due("2026-11-05", 100), name: "A" },
    ];
    expect(sortBills(rows).map((r) => r.name)).toEqual(["Z", "A", "B"]);
  });

  it("does not change the input", () => {
    const rows = [
      { ...due("2026-11-09"), name: "B" },
      { ...due("2026-11-01"), name: "A" },
    ];
    sortBills(rows);
    expect(rows.map((r) => r.name)).toEqual(["B", "A"]);
  });
});

describe("billTotals", () => {
  const rows: BillMonthLike[] = [
    { ...due("2026-11-01", 45_000), status: "paid" },
    { ...due("2026-11-02", 3_500), status: "paid" },
    { ...due("2026-11-02", 1_100) },
    { ...due("2026-11-05", 38_500) },
    { ...due("2026-11-20", 2_000), status: "skipped" },
  ];

  it("adds paid, to pay (overdue included) and skipped separately", () => {
    const t = billTotals(rows, 100_000 * KES);
    expect(t.paidCents).toBe(48_500 * KES);
    expect(t.toPayCents).toBe(39_600 * KES);
    expect(t.skippedCents).toBe(2_000 * KES);
    expect(t.leftAfterPayingCents).toBe(60_400 * KES);
  });

  it("works out the paid share without the skipped bills", () => {
    expect(billTotals(rows, 0).paidShare).toBeCloseTo(48_500 / 88_100);
  });

  it("goes negative when the bills do not fit", () => {
    expect(billTotals(rows, 10_000 * KES).leftAfterPayingCents).toBe(-29_600 * KES);
  });

  it("is all zero with no bills", () => {
    expect(billTotals([], 5 * KES)).toEqual({
      paidCents: 0,
      toPayCents: 0,
      skippedCents: 0,
      paidShare: 0,
      leftAfterPayingCents: 5 * KES,
    });
  });
});

describe("filterBills", () => {
  const rows: BillMonthLike[] = [
    due("2026-11-01"),
    { ...due("2026-11-02"), status: "paid" },
    { ...due("2026-11-03"), status: "skipped" },
  ];
  it("keeps everything for all, only due for to pay, only paid for paid", () => {
    expect(filterBills(rows, "all")).toHaveLength(3);
    expect(filterBills(rows, "to-pay").map((r) => r.status)).toEqual(["due"]);
    expect(filterBills(rows, "paid").map((r) => r.status)).toEqual(["paid"]);
  });
});

describe("nairobiMonth", () => {
  it("is the first of the Nairobi month", () => {
    expect(nairobiMonth(NOW)).toBe("2026-11-01");
    expect(nairobiMonth(new Date("2026-11-30T21:30:00Z"))).toBe("2026-12-01");
  });
});
