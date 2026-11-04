import { describe, expect, it } from "vitest";

import {
  budgetChanges,
  budgetProblem,
  buildBudgetItem,
  canBudget,
  setAsideCents,
  sortBudgetItems,
  toBudgetItem,
  type BudgetItem,
} from "./budget";

const KES = 100;
const item = (name: string, status: BudgetItem["status"], amount = 1_000): BudgetItem => ({
  id: name,
  name,
  amount_cents: amount * KES,
  status,
  month: "2026-11-01",
  accountId: "a",
  accountName: "Bank",
  accountEmoji: "🏦",
  version: 1,
});

describe("pending vs approved", () => {
  it("only approved items are set aside; pending is a plan, done is already spent", () => {
    expect(
      setAsideCents([
        item("School fees", "pending", 35_000),
        item("Tyres", "approved", 24_000),
        item("Travel", "approved", 30_000),
        item("Service", "done", 8_000),
      ]),
    ).toBe(54_000 * KES);
  });

  it("approves pending items only, and cancels pending or approved ones", () => {
    expect(canBudget(item("a", "pending"), "approve")).toBe(true);
    expect(canBudget(item("a", "approved"), "approve")).toBe(false);
    expect(canBudget(item("a", "pending"), "cancel")).toBe(true);
    expect(canBudget(item("a", "approved"), "cancel")).toBe(true);
    expect(canBudget(item("a", "done"), "cancel")).toBe(false);
  });

  it("approving records when; cancelling keeps the row", () => {
    const now = new Date("2026-11-04T09:00:00Z");
    expect(budgetChanges("approve", now)).toEqual({ status: "approved", approved_at: now.toISOString() });
    expect(budgetChanges("cancel", now)).toEqual({ status: "cancelled" });
  });

  it("lists items waiting for a decision first", () => {
    const list = [item("A", "done"), item("B", "approved"), item("C", "pending"), item("D", "pending")];
    expect(sortBudgetItems(list).map((i) => i.name)).toEqual(["C", "D", "B", "A"]);
  });
});

describe("the new item form", () => {
  it("needs a name, an amount above zero and an account", () => {
    expect(budgetProblem({ name: "", amount: "100", accountId: "a" })).toMatch(/what the money is for/);
    expect(budgetProblem({ name: "Tyres", amount: "0", accountId: "a" })).toMatch(/above zero/);
    expect(budgetProblem({ name: "Tyres", amount: "24,000", accountId: "" })).toMatch(/account/);
    expect(budgetProblem({ name: "Tyres", amount: "24,000", accountId: "a" })).toBeUndefined();
  });

  it("saves a pending item for this month", () => {
    expect(buildBudgetItem({ name: " Tyres ", amount: "24,000", accountId: "a" }, "2026-11-01")).toEqual({
      name: "Tyres",
      amount_cents: 24_000 * KES,
      account_id: "a",
      month: "2026-11-01",
    });
  });
});

describe("toBudgetItem", () => {
  it("reads the row and its account", () => {
    expect(
      toBudgetItem({
        id: "1",
        name: "Tyres",
        amount_cents: 2_400_000,
        status: "approved",
        month: "2026-11-01",
        account_id: "a",
        version: 2,
        account: { name: "Money market", emoji: "📈" },
      }),
    ).toMatchObject({ status: "approved", accountName: "Money market", accountEmoji: "📈", version: 2 });
  });
});
