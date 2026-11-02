import { dayLabel, monthStart, rowLook, shortDate } from "./format";

// 2026-11-02 10:00 in Nairobi.
const now = new Date("2026-11-02T07:00:00Z");

describe("dayLabel", () => {
  it("names today and yesterday by the Nairobi calendar", () => {
    expect(dayLabel("2026-11-02T05:00:00Z", now)).toBe("Today");
    // 22:30 UTC on 1 Nov is 01:30 on 2 Nov in Nairobi.
    expect(dayLabel("2026-11-01T22:30:00Z", now)).toBe("Today");
    expect(dayLabel("2026-11-01T20:00:00Z", now)).toBe("Yesterday");
  });

  it("shows the date further back, with the year only outside this one", () => {
    expect(dayLabel("2026-10-29T09:00:00Z", now)).toBe("29 Oct");
    expect(dayLabel("2025-12-31T09:00:00Z", now)).toBe("31 Dec 2025");
    expect(shortDate("2026-11-02T05:00:00Z", now)).toBe("2 Nov");
  });
});

describe("monthStart", () => {
  it("uses the Nairobi month", () => {
    expect(monthStart(now)).toBe("2026-11-01");
    // 21:30 UTC on 31 Oct is already 1 Nov in Nairobi.
    expect(monthStart(new Date("2026-10-31T21:30:00Z"))).toBe("2026-11-01");
    expect(monthStart(new Date("2026-10-31T20:30:00Z"))).toBe("2026-10-01");
  });
});

describe("rowLook", () => {
  const food = { name: "Food", emoji: "🛒", colour: "cat-2", id: "c1" };

  it("puts review first, then the category, then the kind", () => {
    expect(rowLook({ kind: "spending", needs_review: true, category: food })).toMatchObject({
      label: "To review",
      review: true,
    });
    expect(rowLook({ kind: "spending", needs_review: false, category: food })).toEqual({
      label: "Food",
      emoji: "🛒",
      colour: "cat-2",
      review: false,
    });
    expect(rowLook({ kind: "transfer", needs_review: false, category: null })).toMatchObject({
      label: "Transfer",
    });
    expect(rowLook({ kind: "spending", needs_review: false, category: null })).toMatchObject({
      label: "Uncategorised",
    });
  });
});
