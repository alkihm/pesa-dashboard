import { classify, dedupeKeys, type LedgerRow } from "./dedupe";
import type { PlannedRow } from "./rows";
import { rowsFor } from "./save";

// Invented rows.
const row = (line: number, o: Partial<PlannedRow> = {}): PlannedRow => ({
  line,
  day: "2026-11-05",
  occurredAt: "2026-11-05T09:00:00.000Z",
  accountId: "mp",
  accountName: "M-PESA",
  kind: "spending",
  cents: 45_000,
  categoryId: null,
  categoryName: null,
  toAccountId: null,
  toAccountName: null,
  payee: "DEMO CAFE",
  note: null,
  ref: null,
  ...o,
});
const ledger = (o: Partial<LedgerRow>): LedgerRow => ({
  account_id: "mp",
  occurred_at: "2026-11-05T15:00:00Z",
  amount_cents: -45_000,
  ref: null,
  dedupe_key: null,
  ...o,
});

describe("dedupeKeys", () => {
  it("uses the ref when there is one, else a hash numbered among identical rows", () => {
    const keys = dedupeKeys([row(2, { ref: "TKA1" }), row(3), row(4), row(5, { cents: 1 })]);
    expect(keys[0]).toBe("import:ref:TKA1");
    expect(keys[1]).toMatch(/^import:[0-9a-f]{16}:0$/);
    expect(keys[2]).toBe(keys[1]!.replace(/:0$/, ":1"));
    expect(keys[3]).toMatch(/:0$/);
  });

  it("gives the same keys for the same file", () => {
    const file = [row(2), row(3, { payee: "OTHER" })];
    expect(dedupeKeys(file)).toEqual(dedupeKeys(file));
  });
});

describe("classify", () => {
  const status = (rows: PlannedRow[], led: LedgerRow[] = []) =>
    classify(rows, led).map((c) => [
      c.row.line,
      c.verdict.status,
      "reason" in c.verdict ? c.verdict.reason : "",
    ]);

  it("marks a ref already in the ledger, from any source, as a duplicate", () => {
    expect(
      status([row(2, { ref: "TKA1" })], [ledger({ ref: "tka1", occurred_at: "2026-10-01T00:00:00Z" })]),
    ).toEqual([[2, "duplicate", "Already in the ledger (ref TKA1)"]]);
  });

  it("marks a ref repeated in the file", () => {
    expect(status([row(2, { ref: "TKA1" }), row(3, { ref: "TKA1", cents: 1 })])).toEqual([
      [2, "new", ""],
      [3, "duplicate", "Same ref as row 2"],
    ]);
  });

  it("knows rows imported before by their key", () => {
    const [first] = classify([row(2)], []);
    expect(status([row(2)], [ledger({ dedupe_key: first!.key, amount_cents: 1 })])).toEqual([
      [2, "duplicate", "Imported before"],
    ]);
    const [transfer] = classify([row(2, { kind: "transfer", toAccountId: "bk" })], []);
    const legs = rowsFor(transfer!, "b", () => "id");
    expect(
      status(
        [row(2, { kind: "transfer", toAccountId: "bk" })],
        legs.map((l) => ledger({ dedupe_key: l.dedupe_key, amount_cents: 1 })),
      ),
    ).toEqual([[2, "duplicate", "Imported before"]]);
  });

  it("flags the same amount on the same account and day as likely, one ledger row per file row", () => {
    expect(status([row(2), row(3)], [ledger({})])).toEqual([
      [2, "likely", "The ledger has the same amount on this account that day"],
      [3, "new", ""],
    ]);
  });

  it("compares Nairobi days and the signed amount", () => {
    // 22:00 UTC on 4 Nov is 01:00 on 5 Nov in Nairobi.
    expect(status([row(2)], [ledger({ occurred_at: "2026-11-04T22:00:00Z" })])[0]![1]).toBe("likely");
    expect(status([row(2)], [ledger({ occurred_at: "2026-11-04T20:00:00Z" })])[0]![1]).toBe("new");
    expect(status([row(2, { kind: "income" })], [ledger({})])[0]![1]).toBe("new");
  });

  it("does not guess when the row has a ref of its own", () => {
    expect(status([row(2, { ref: "TKA9" })], [ledger({})])[0]![1]).toBe("new");
  });
});
