// Category budgets ([3.6]): how much of a monthly budget is spent. One rule for every screen that shows it
// (Categories, Month): at or above 90% amber, over red. Income categories have no budget.

import { formatAmount } from "./money";

/** At or above this share of the budget the bar turns amber. */
export const NEAR = 0.9;

export interface BudgetStatus {
  tone: "none" | "ok" | "near" | "over";
  /** Bar width, 0–1; capped at a full bar. */
  fill: number;
  /** "1,600 left", "Over by 3,700", "No budget". */
  text: string;
}

export function budgetStatus(
  spent: number,
  budget: number | null,
  kind: "spending" | "income",
): BudgetStatus {
  if (kind === "income" || !budget)
    return { tone: "none", fill: 0, text: kind === "income" ? "This month" : "No budget" };
  const ratio = spent / budget;
  if (spent > budget) return { tone: "over", fill: 1, text: `Over by ${formatAmount(spent - budget)}` };
  return { tone: ratio >= NEAR ? "near" : "ok", fill: ratio, text: `${formatAmount(budget - spent)} left` };
}
