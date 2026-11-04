// Categories ([2.8]): budget status, the list rows, and the new/edit form. Plain functions, tested on their own.
// Categories are only spending or income (D-009 rule 11): saving is a transfer to a savings account.

import { amountCents, formatTyped } from "@/features/transactions/form";
import { budgetStatus, type BudgetStatus } from "@/lib/budget";
import { CATEGORY_COLOURS } from "@/lib/categoryColours";

export type Kind = "spending" | "income";

export interface CategoryRecord {
  id: string;
  name: string;
  emoji: string | null;
  colour: string;
  kind: string;
  monthly_budget_cents: number | null;
  system: boolean;
  sort_order: number;
  archived_at: string | null;
  version: number;
}

export interface Rule {
  id: string;
  pattern: string;
  category_id: string | null;
}

// ---- budget --------------------------------------------------------------------------------------------

// The rule is shared with the Month view ([3.6]); kept importable from here for the Categories screen.
export { budgetStatus, NEAR, type BudgetStatus } from "@/lib/budget";

// ---- list ----------------------------------------------------------------------------------------------

export interface CategoryRow {
  category: CategoryRecord;
  /** This month: spent for spending categories, received for income. */
  cents: number;
  rules: number;
  budget: BudgetStatus;
}

/** Active categories of one kind, in the owner's order, with this month's total and their rule count. */
export function categoryRows(
  categories: CategoryRecord[],
  totals: Map<string, number>,
  rules: Rule[],
  kind: Kind,
): CategoryRow[] {
  return categories
    .filter((c) => c.kind === kind && !c.archived_at)
    .map((category) => {
      const cents = totals.get(category.id) ?? 0;
      return {
        category,
        cents,
        rules: rules.filter((r) => r.category_id === category.id).length,
        budget: budgetStatus(cents, category.monthly_budget_cents, kind),
      };
    });
}

export const rulesText = (n: number) => `${n} ${n === 1 ? "payee rule" : "payee rules"}`;

// ---- form ----------------------------------------------------------------------------------------------

/** The emoji grid from the "New category" board, with the names screen readers say. */
export const EMOJIS: [string, string][] = [
  ["🏠", "home"],
  ["🛒", "groceries"],
  ["⛽", "fuel"],
  ["🚗", "car"],
  ["🚌", "bus"],
  ["💡", "electricity"],
  ["💧", "water"],
  ["🌐", "internet"],
  ["📱", "phone"],
  ["📺", "TV"],
  ["🍽️", "dining"],
  ["☕", "coffee"],
  ["🍺", "drinks"],
  ["🛍️", "shopping"],
  ["👕", "clothes"],
  ["💅", "beauty"],
  ["💊", "health"],
  ["🏋️", "gym"],
  ["🎓", "school"],
  ["📚", "books"],
  ["👪", "family"],
  ["👶", "baby"],
  ["🐶", "pet"],
  ["🎁", "gifts"],
  ["✈️", "travel"],
  ["🎮", "games"],
  ["⛪", "church"],
  ["💸", "loan"],
  ["🧾", "fees"],
  ["💰", "salary"],
  ["📈", "investment"],
  ["🏷️", "other"],
];

export const COLOURS = CATEGORY_COLOURS;

export interface Form {
  name: string;
  kind: Kind;
  emoji: string;
  colour: string;
  /** As typed, in shillings: "6,000". Empty for no budget. */
  budget: string;
  /** Payee patterns, upper case, no duplicates. */
  rules: string[];
}

export function emptyForm(kind: Kind = "spending"): Form {
  return { name: "", kind, emoji: "🏷️", colour: "cat-1", budget: "", rules: [] };
}

export function formFor(category: CategoryRecord, rules: Rule[]): Form {
  return {
    name: category.name,
    kind: category.kind === "income" ? "income" : "spending",
    emoji: category.emoji ?? "🏷️",
    colour: category.colour,
    budget: category.monthly_budget_cents ? formatTyped(category.monthly_budget_cents) : "",
    rules: rules.filter((r) => r.category_id === category.id).map((r) => r.pattern),
  };
}

/** Upper-cased and trimmed; null when empty or already in the list. */
export function cleanRule(text: string, existing: string[]): string | null {
  const rule = text.trim().replace(/\s+/g, " ").toUpperCase();
  return rule && !existing.includes(rule) ? rule : null;
}

/** What stops a save, or undefined when the form can be saved. */
export function problem(form: Form, others: CategoryRecord[], editingId?: string): string | undefined {
  const name = form.name.trim();
  if (!name) return "Give the category a name.";
  const clash = others.find(
    (c) =>
      c.id !== editingId &&
      !c.archived_at &&
      c.kind === form.kind &&
      c.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) return `There is already a ${form.kind} category called ${clash.name}.`;
  if (form.kind === "spending" && form.budget.trim() && amountCents(form.budget) === undefined) {
    return "The budget should be an amount, like 6,000.";
  }
  return undefined;
}

/** The columns a save writes. Income categories have no budget. */
export function values(form: Form) {
  return {
    name: form.name.trim(),
    kind: form.kind,
    emoji: form.emoji,
    colour: form.colour,
    monthly_budget_cents: form.kind === "spending" ? (amountCents(form.budget) ?? null) : null,
  };
}

/** Which rule patterns to add and which rule rows to remove, comparing the form with what is stored. */
export function ruleChanges(form: Form, stored: Rule[]) {
  return {
    add: form.rules.filter((p) => !stored.some((r) => r.pattern === p)),
    remove: stored.filter((r) => !form.rules.includes(r.pattern)).map((r) => r.id),
  };
}
