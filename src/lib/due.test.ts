import { daysBetween, dueTone, formatDay, nairobiToday, nextDueOn } from "./due";

describe("due dates", () => {
  it("takes today from Nairobi time", () => {
    expect(nairobiToday(new Date("2026-11-02T20:59:00Z"))).toBe("2026-11-02");
    expect(nairobiToday(new Date("2026-11-02T21:00:00Z"))).toBe("2026-11-03");
  });

  it("counts days between calendar days", () => {
    expect(daysBetween("2026-11-03", "2026-11-08")).toBe(5);
    expect(daysBetween("2026-11-03", "2026-11-01")).toBe(-2);
    expect(daysBetween("2026-03-28", "2026-04-02")).toBe(5);
  });

  it("finds the next due day, today included", () => {
    const now = new Date("2026-11-03T09:00:00Z");
    expect(nextDueOn(3, now)).toEqual({ on: "2026-11-03", days: 0 });
    expect(nextDueOn(8, now)).toEqual({ on: "2026-11-08", days: 5 });
    expect(nextDueOn(1, now)).toEqual({ on: "2026-12-01", days: 28 });
  });

  it("moves a day past the month's end to its last day", () => {
    expect(nextDueOn(31, new Date("2026-11-20T09:00:00Z")).on).toBe("2026-11-30");
    expect(nextDueOn(31, new Date("2027-02-10T09:00:00Z")).on).toBe("2027-02-28");
    expect(nextDueOn(30, new Date("2026-12-31T09:00:00Z")).on).toBe("2027-01-30");
  });

  it("colours by days left", () => {
    expect([-2, 0, 1, 3, 4, 7, 8, 30].map(dueTone)).toEqual([
      "red",
      "red",
      "orange",
      "orange",
      "amber",
      "amber",
      "blue",
      "blue",
    ]);
  });

  it("formats a day as on the boards", () => {
    expect(formatDay("2026-11-08")).toBe("8 Nov");
    expect(formatDay("2027-09-15")).toBe("15 Sep");
  });
});
