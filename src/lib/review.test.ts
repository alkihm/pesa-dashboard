import { addDays, reviewBands, reviewHistory, reviewStatus, type ReviewRecord } from "./review";

// 7 Nov 2026, 10:00 in Nairobi.
const now = new Date("2026-11-07T07:00:00Z");
/** A review completed `n` Nairobi days before `now`, at 20:00 Nairobi. */
const daysAgo = (n: number) => `${addDays("2026-11-07", -n)}T17:00:00Z`;

describe("reviewStatus", () => {
  const at = (days: number | null, extra: { intervalDays?: number; mismatches?: number } = {}) =>
    reviewStatus({
      lastReviewedAt: days === null ? null : daysAgo(days),
      mismatches: 0,
      now,
      ...extra,
    });

  it("is green inside the interval", () => {
    expect(at(0)).toMatchObject({
      tone: "green",
      title: "All good",
      text: "Reviewed today. Next review 10 Nov.",
      last: "Last done today",
      nextOn: "2026-11-10",
      daysSince: 0,
    });
    expect(at(2)).toMatchObject({ tone: "green", text: "Next review 8 Nov.", last: "Last done 5 Nov" });
  });

  it("turns amber once the interval has passed (3–6 days at the default)", () => {
    expect(at(3)).toMatchObject({
      tone: "amber",
      title: "Review due",
      text: "Last review was 3 days ago; the reminder is every 3 days.",
    });
    expect(at(6).tone).toBe("amber");
  });

  it("turns red after twice the interval plus one day (7 days at the default)", () => {
    expect(at(7)).toMatchObject({ tone: "red", title: "Review overdue", short: "Review overdue" });
    expect(at(30).tone).toBe("red");
  });

  it("follows the interval from Settings", () => {
    expect(at(4, { intervalDays: 5 }).tone).toBe("green");
    expect(at(5, { intervalDays: 5 }).tone).toBe("amber");
    expect(at(10, { intervalDays: 5 }).tone).toBe("amber");
    expect(at(11, { intervalDays: 5 }).tone).toBe("red");
    expect(at(1, { intervalDays: 1 }).tone).toBe("amber");
    expect(at(3, { intervalDays: 1 }).tone).toBe("red");
  });

  it("falls back to 3 days for a missing or invalid interval", () => {
    expect(at(3, { intervalDays: 0 }).tone).toBe("amber");
    expect(
      reviewStatus({ lastReviewedAt: daysAgo(3), intervalDays: null, mismatches: 0, now }).interval,
    ).toBe(3);
  });

  it("is red on any mismatch, even just after a review", () => {
    expect(at(0, { mismatches: 1 })).toMatchObject({
      tone: "red",
      title: "Needs reconciling",
      text: "One account is off against its SMS or count.",
    });
    expect(at(1, { mismatches: 2 }).text).toBe("2 accounts are off against their SMS or count.");
  });

  it("is due before the first review", () => {
    expect(at(null)).toMatchObject({
      tone: "amber",
      title: "Review due",
      last: "No review yet",
      nextOn: null,
    });
  });

  it("counts Nairobi calendar days, not hours", () => {
    // 23:30 Nairobi on 4 Nov is still 4 Nov there (20:30 UTC): three days before 7 Nov.
    expect(reviewStatus({ lastReviewedAt: "2026-11-04T20:30:00Z", mismatches: 0, now }).daysSince).toBe(3);
    // 00:30 Nairobi on 5 Nov is 21:30 UTC on 4 Nov: two days.
    expect(reviewStatus({ lastReviewedAt: "2026-11-04T21:30:00Z", mismatches: 0, now }).daysSince).toBe(2);
  });
});

describe("reviewBands", () => {
  it("labels the legend from the interval", () => {
    expect(reviewBands(3)).toEqual({ green: "0–3 days", amber: "3–7 days", red: "7+ days or a mismatch" });
    expect(reviewBands(5).red).toBe("11+ days or a mismatch");
  });
});

describe("reviewHistory", () => {
  const rec = (id: string, days: number, result: ReviewRecord["result"] = "all_match", leftOpen = 0) => ({
    id,
    completedAt: daysAgo(days),
    result,
    leftOpen,
  });

  it("lists reviews newest first with their outcome", () => {
    expect(reviewHistory([rec("a", 0), rec("b", 3, "fixed"), rec("c", 6, "left_open", 1)], 3, now)).toEqual([
      { id: "a", day: "Today", note: "Reviewed · all match", tone: "green" },
      { id: "b", day: "4 Nov", note: "Reviewed · gaps fixed", tone: "green" },
      { id: "c", day: "1 Nov", note: "Reviewed · 1 left open", tone: "red" },
    ]);
  });

  it("marks a review that came later than the interval", () => {
    const rows = reviewHistory([rec("a", 0), rec("b", 5)], 3, now);
    expect(rows[0]).toMatchObject({ note: "Late by 2 days · all match", tone: "amber" });
    expect(rows[1]).toMatchObject({ note: "Reviewed · all match", tone: "green" });
  });

  it("keeps red for a late review that left accounts open", () => {
    expect(reviewHistory([rec("a", 0, "left_open", 2), rec("b", 10)], 3, now)[0]).toMatchObject({
      note: "Late by 7 days · 2 left open",
      tone: "red",
    });
  });
});
