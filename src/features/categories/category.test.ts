import {
  budgetStatus,
  categoryRows,
  cleanRule,
  emptyForm,
  formFor,
  problem,
  ruleChanges,
  values,
  type CategoryRecord,
} from "./category";

const KES = 100;

function category(over: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: "c1",
    name: "Eating out",
    emoji: "🍽️",
    colour: "cat-7",
    kind: "spending",
    monthly_budget_cents: 6_000 * KES,
    system: false,
    sort_order: 1,
    archived_at: null,
    version: 1,
    ...over,
  };
}

describe("budgetStatus", () => {
  it("is green under 90%, amber from 90%, red over", () => {
    expect(budgetStatus(4_000 * KES, 6_000 * KES, "spending")).toMatchObject({
      tone: "ok",
      text: "2,000 left",
    });
    expect(budgetStatus(5_400 * KES, 6_000 * KES, "spending")).toMatchObject({
      tone: "near",
      text: "600 left",
    });
    expect(budgetStatus(8_900 * KES, 6_000 * KES, "spending")).toEqual({
      tone: "over",
      fill: 1,
      text: "Over by 2,900",
    });
  });

  it("has no bar without a budget, or for income", () => {
    expect(budgetStatus(100, null, "spending")).toMatchObject({ tone: "none", text: "No budget" });
    expect(budgetStatus(100, 500, "income")).toMatchObject({ tone: "none", text: "This month" });
  });
});

describe("categoryRows", () => {
  it("keeps one kind's active categories, with this month's total and rule count", () => {
    const list = [
      category(),
      category({ id: "c2", name: "Old", archived_at: "2026-10-01T00:00:00Z" }),
      category({ id: "c3", name: "Salary", kind: "income", monthly_budget_cents: null }),
    ];
    const rows = categoryRows(
      list,
      new Map([["c1", 8_900 * KES]]),
      [
        { id: "r1", pattern: "CAFE", category_id: "c1" },
        { id: "r2", pattern: "JAVA", category_id: "c1" },
      ],
      "spending",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cents: 8_900 * KES, rules: 2, budget: { tone: "over" } });
  });
});

describe("form", () => {
  it("starts empty, or from a category with its rules", () => {
    expect(emptyForm("income")).toMatchObject({ kind: "income", name: "", rules: [] });
    expect(formFor(category(), [{ id: "r1", pattern: "CAFE", category_id: "c1" }])).toMatchObject({
      name: "Eating out",
      budget: "6000",
      rules: ["CAFE"],
    });
  });

  it("cleans rules and skips repeats", () => {
    expect(cleanRule("  java  house ", [])).toBe("JAVA HOUSE");
    expect(cleanRule("cafe", ["CAFE"])).toBeNull();
    expect(cleanRule("   ", [])).toBeNull();
  });

  it("needs a name that is not taken, and a budget that is an amount", () => {
    const others = [category()];
    expect(problem({ ...emptyForm(), name: " " }, others)).toBe("Give the category a name.");
    expect(problem({ ...emptyForm(), name: "eating OUT" }, others)).toMatch(/already a spending category/);
    expect(problem({ ...emptyForm("income"), name: "Eating out" }, others)).toBeUndefined();
    expect(problem({ ...emptyForm(), name: "Eating out" }, others, "c1")).toBeUndefined();
    expect(problem({ ...emptyForm(), name: "Gym", budget: "lots" }, others)).toMatch(/amount/);
  });

  it("writes a budget only for spending", () => {
    expect(values({ ...emptyForm(), name: " Gym ", budget: "2,500" })).toMatchObject({
      name: "Gym",
      monthly_budget_cents: 2_500 * KES,
    });
    expect(values({ ...emptyForm("income"), name: "Tips", budget: "2,500" }).monthly_budget_cents).toBeNull();
    expect(values({ ...emptyForm(), name: "Gym" }).monthly_budget_cents).toBeNull();
  });

  it("works out which rules to add and remove", () => {
    const stored = [
      { id: "r1", pattern: "CAFE", category_id: "c1" },
      { id: "r2", pattern: "JAVA", category_id: "c1" },
    ];
    expect(ruleChanges({ ...emptyForm(), rules: ["JAVA", "ARTCAFFE"] }, stored)).toEqual({
      add: ["ARTCAFFE"],
      remove: ["r1"],
    });
  });
});
