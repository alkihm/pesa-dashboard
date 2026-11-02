import type { ActivityRow } from "./query";
import { patchFor, savedMessage } from "./save";

const row = (over: Partial<ActivityRow> = {}) =>
  ({ needs_review: true, original_currency: null, category: null, ...over }) as ActivityRow;

describe("patchFor", () => {
  it("clears review when a category is chosen and trims the note", () => {
    expect(patchFor(row(), { categoryId: "c1", note: "  lunch ", always: false })).toEqual({
      category_id: "c1",
      note: "lunch",
      needs_review: false,
    });
  });

  it("keeps a foreign-currency estimate in review, and a note-only edit keeps review as it was", () => {
    expect(
      patchFor(row({ original_currency: "USD" }), { categoryId: "c1", note: "", always: false }),
    ).toMatchObject({
      needs_review: true,
      note: null,
    });
    expect(patchFor(row(), { categoryId: null, note: "ask Ben", always: false })).toMatchObject({
      needs_review: true,
    });
  });
});

describe("savedMessage", () => {
  it("says what a rule did", () => {
    expect(savedMessage({ row: row() })).toBe("Saved");
    expect(savedMessage({ row: row(), applied: 0 })).toBe(
      "Saved · the rule applies to new messages from now on",
    );
    expect(savedMessage({ row: row(), applied: 1 })).toBe(
      "Saved · the rule also categorised 1 past transaction",
    );
    expect(savedMessage({ row: row(), applied: 1200 })).toBe(
      "Saved · the rule also categorised 1,200 past transactions",
    );
  });
});
