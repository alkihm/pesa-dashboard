import { describe, expect, it } from "vitest";

import type { Db } from "@/lib/supabase";
import { actionChanges, allowed, applyAction, canPayOrSkip, canUndo, sendBillAction } from "./actions";
import type { BillRow } from "./data";

const NOW = new Date("2026-11-03T09:00:00Z");
const row: BillRow = {
  id: "m1",
  billId: "b1",
  month: "2026-11-01",
  name: "Internet",
  emoji: "🌐",
  accountId: null,
  due_on: "2026-11-05",
  amount_cents: 350_000,
  status: "due",
  paidAt: null,
  transactionId: null,
  viaSms: false,
  version: 3,
};

describe("which actions a month offers", () => {
  it("offers Pay and Skip only while the month is owed", () => {
    expect(canPayOrSkip(row)).toBe(true);
    expect(canPayOrSkip({ status: "paid" })).toBe(false);
    expect(canPayOrSkip({ status: "skipped" })).toBe(false);
  });

  it("offers Undo for a month paid by hand or skipped", () => {
    expect(canUndo({ ...row, status: "paid" })).toBe(true);
    expect(canUndo({ ...row, status: "skipped" })).toBe(true);
    expect(canUndo(row)).toBe(false);
  });

  it("never offers Undo for a month an SMS payment paid", () => {
    const smsPaid: BillRow = { ...row, status: "paid", viaSms: true, transactionId: "t1" };
    const manualPayment: BillRow = { ...row, status: "paid", viaSms: false, transactionId: "t2" };
    expect(canUndo(smsPaid)).toBe(false);
    expect(canUndo(manualPayment)).toBe(true);
    expect(allowed(smsPaid, "undo")).toBe(false);
  });
});

describe("what an action writes", () => {
  it("pay marks paid now, skip clears the paid time, undo returns to owed", () => {
    expect(actionChanges("pay", NOW)).toEqual({
      status: "paid",
      paid_at: NOW.toISOString(),
      skip_reason: null,
    });
    expect(actionChanges("skip", NOW)).toEqual({ status: "skipped", paid_at: null });
    expect(actionChanges("undo", NOW)).toEqual({ status: "due", paid_at: null, skip_reason: null });
  });

  it("shows the change before the database answers", () => {
    expect(applyAction(row, "pay", NOW)).toMatchObject({
      status: "paid",
      paidAt: NOW.toISOString(),
      version: 4,
    });
    expect(applyAction({ ...row, status: "paid", paidAt: "x" }, "undo", NOW)).toMatchObject({
      status: "due",
      paidAt: null,
    });
  });
});

describe("sendBillAction", () => {
  function fake(result: { data: unknown; error: { message: string } | null }) {
    const calls: [string, unknown[]][] = [];
    const builder: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
    };
    for (const op of ["update", "eq", "select"])
      builder[op] = (...args: unknown[]) => {
        calls.push([op, args]);
        return builder;
      };
    const db = { from: () => builder } as unknown as Db;
    return { db, calls };
  }

  it("updates the row only at the version the screen showed", async () => {
    const { db, calls } = fake({ data: [{ version: 4 }], error: null });
    expect(await sendBillAction(db, row, "skip", NOW)).toEqual({ ok: true, version: 4 });
    expect(calls).toEqual([
      ["update", [{ status: "skipped", paid_at: null }]],
      ["eq", ["id", "m1"]],
      ["eq", ["version", 3]],
      ["select", ["version"]],
    ]);
  });

  it("reports a row changed elsewhere when nothing was updated", async () => {
    const { db } = fake({ data: [], error: null });
    expect(await sendBillAction(db, row, "pay", NOW)).toMatchObject({ ok: false, reason: "changed" });
  });

  it("passes on a refusal from the database", async () => {
    const { db } = fake({ data: null, error: { message: "this bill was paid by an SMS payment" } });
    expect(await sendBillAction(db, row, "undo", NOW)).toEqual({
      ok: false,
      reason: "error",
      message: "this bill was paid by an SMS payment",
    });
  });
});
