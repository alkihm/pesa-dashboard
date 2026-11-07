import type { Db } from "@/lib/supabase";
import type { Checked } from "./dedupe";
import type { PlannedRow } from "./rows";
import { rowsFor, saveImport } from "./save";

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
  note: "lunch",
  ref: "TKA1",
  ...o,
});
const checked = (r: PlannedRow, key = `k${r.line}`): Checked => ({ row: r, key, verdict: { status: "new" } });
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe("rowsFor", () => {
  it("makes spending negative, marks it imported, and sends it to Review without a category", () => {
    expect(rowsFor(checked(row(2)), "batch", ids())).toEqual([
      {
        id: "id1",
        occurred_at: "2026-11-05T09:00:00.000Z",
        account_id: "mp",
        amount_cents: -45_000,
        kind: "spending",
        category_id: null,
        transfer_id: null,
        payee: "DEMO CAFE",
        note: "lunch",
        ref: "TKA1",
        source: "import",
        dedupe_key: "k2",
        needs_review: true,
        import_batch_id: "batch",
      },
    ]);
  });

  it("keeps income positive and categorised rows out of Review", () => {
    expect(rowsFor(checked(row(2, { kind: "income", categoryId: "pay" })), "b", ids())[0]).toMatchObject({
      amount_cents: 45_000,
      category_id: "pay",
      needs_review: false,
    });
  });

  it("makes a transfer two legs summing to zero with one transfer id", () => {
    const legs = rowsFor(checked(row(2, { kind: "transfer", toAccountId: "bk" })), "b", ids());
    expect(legs.map((l) => [l.account_id, l.amount_cents, l.transfer_id, l.dedupe_key, l.ref])).toEqual([
      ["mp", -45_000, "id1", "k2:out", "TKA1"],
      ["bk", 45_000, "id1", "k2:in", null],
    ]);
  });
});

function fakeDb(failOn?: number) {
  const inserts: { table: string; values: unknown }[] = [];
  const updates: unknown[] = [];
  let txInserts = 0;
  const db = {
    from(table: string) {
      let error: { message: string } | null = null;
      const builder: Record<string, unknown> = {
        insert: (values: unknown) => {
          inserts.push({ table, values });
          if (table === "transactions" && ++txInserts === failOn) error = { message: "boom" };
          return builder;
        },
        update: (values: unknown) => {
          updates.push(values);
          return builder;
        },
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === "import_batches" ? { id: "batch1" } : null, error }).then(ok),
      };
      for (const name of ["select", "single", "eq"]) builder[name] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as Db, inserts, updates };
}

describe("saveImport", () => {
  it("names the file in a batch, saves in chunks of up to 500 with transfer legs together, and counts", async () => {
    const rows = [
      ...Array.from({ length: 499 }, (_, i) => checked(row(i + 2, { ref: null }))),
      checked(row(600, { kind: "transfer", toAccountId: "bk", ref: null })),
      checked(row(601, { ref: null })),
    ];
    const fake = fakeDb();
    const result = await saveImport(fake.db, "gaps.xlsx", rows, ids());
    expect(result).toEqual({ batchId: "batch1", saved: 501, error: undefined });
    expect(fake.inserts[0]).toEqual({
      table: "import_batches",
      values: { file_name: "gaps.xlsx", row_count: 0 },
    });
    const chunks = fake.inserts
      .filter((i) => i.table === "transactions")
      .map((i) => (i.values as unknown[]).length);
    // 499 rows, then the transfer's 2 legs would make 501: they start the next chunk with the last row.
    expect(chunks).toEqual([499, 3]);
    expect(fake.updates).toEqual([{ row_count: 501 }]);
  });

  it("stops at a failed chunk, keeps what was saved and says so", async () => {
    const rows = Array.from({ length: 700 }, (_, i) => checked(row(i + 2, { ref: null })));
    const fake = fakeDb(2);
    expect(await saveImport(fake.db, "gaps.csv", rows, ids())).toEqual({
      batchId: "batch1",
      saved: 500,
      error: "boom",
    });
    expect(fake.updates).toEqual([{ row_count: 500 }]);
  });
});
