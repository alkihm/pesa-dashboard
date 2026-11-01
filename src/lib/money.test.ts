import { formatAmount, formatCompact, formatKes } from "./money";

describe("money formatting", () => {
  it("shows whole shillings without cents", () => {
    expect(formatAmount(4_500_000)).toBe("45,000");
    expect(formatAmount(0)).toBe("0");
  });

  it("shows cents only when there are some", () => {
    expect(formatAmount(3_350)).toBe("33.50");
    expect(formatAmount(123_456_789)).toBe("1,234,567.89");
  });

  it("adds the currency prefix", () => {
    expect(formatKes(250_000)).toBe("KES 2,500");
  });

  it("marks negatives with a minus sign and positives only when asked", () => {
    expect(formatAmount(-250_000)).toBe("−2,500");
    expect(formatKes(-250_000)).toBe("−KES 2,500");
    expect(formatAmount(250_000, { signed: true })).toBe("+2,500");
    expect(formatAmount(0, { signed: true })).toBe("0");
  });

  it("compacts large amounts for charts", () => {
    expect(formatCompact(17_190_000)).toBe("171.9k");
    expect(formatCompact(20_000_000)).toBe("200k");
    expect(formatCompact(125_000_000)).toBe("1.25M");
    expect(formatCompact(95_000)).toBe("950");
    expect(formatCompact(-4_500_000)).toBe("−45k");
  });
});
