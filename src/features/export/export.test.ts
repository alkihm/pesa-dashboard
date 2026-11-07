import type { Db } from "@/lib/supabase";
import { parseCsv } from "./csv";
import { buildExport, packExport, readExport, readTable, type Row } from "./export";
import { EXPORT_TABLES } from "./tables";
import { unzip, zip } from "./zip";

const now = new Date("2026-11-08T07:00:00Z");

// Invented rows, with the awkward values a real ledger has: commas, quotes, line breaks, emoji, nulls, empty text.
const data: Record<string, Row[]> = {
  accounts: [
    {
      id: "a1",
      name: "Wallet, main",
      kind: "wallet",
      emoji: "📱",
      sort_order: 1,
      debt_term: null,
      counts_in_net: true,
      due_day: null,
      original_cents: null,
      limit_cents: null,
      goal_cents: null,
      locked_until: null,
      sms_account_hint: "mpesa",
      sms_sender: null,
      archived_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
      version: 1,
    },
  ],
  categories: [
    {
      id: "c1",
      name: 'Food & "treats"',
      kind: "spending",
      emoji: "🍽️",
      colour: "cat-1",
      sort_order: 1,
      monthly_budget_cents: 500000,
      system: false,
      archived_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
      version: 2,
    },
  ],
  transactions: [
    {
      id: "t1",
      occurred_at: "2026-10-31T21:30:00+00:00",
      account_id: "a1",
      amount_cents: -150050,
      kind: "spending",
      category_id: "c1",
      payee: "DEMO SHOP",
      channel: "till",
      ref: "TSX0000001",
      note: "line one\nline two",
      reason: null,
      source: "sms",
      sms_id: null,
      transfer_id: null,
      parent_id: null,
      budget_item_id: null,
      import_batch_id: null,
      original_currency: null,
      original_minor: null,
      needs_review: false,
      dedupe_key: "k1",
      deleted_at: null,
      deleted_reason: null,
      created_at: "2026-10-31T21:30:00+00:00",
      updated_at: "2026-10-31T21:30:00+00:00",
      version: 1,
    },
    {
      id: "t2",
      occurred_at: "2026-10-01T06:00:00+00:00",
      account_id: "a1",
      amount_cents: 1000000,
      kind: "income",
      category_id: null,
      payee: "",
      channel: null,
      ref: null,
      note: null,
      reason: null,
      source: "manual",
      sms_id: null,
      transfer_id: null,
      parent_id: null,
      budget_item_id: null,
      import_batch_id: null,
      original_currency: null,
      original_minor: null,
      needs_review: true,
      dedupe_key: null,
      deleted_at: null,
      deleted_reason: null,
      created_at: "2026-10-01T06:00:00+00:00",
      updated_at: "2026-10-01T06:00:00+00:00",
      version: 1,
    },
    {
      id: "t3",
      occurred_at: "2026-10-02T06:00:00+00:00",
      account_id: "a1",
      amount_cents: -100,
      kind: "spending",
      category_id: null,
      payee: "DUPLICATE",
      channel: null,
      ref: null,
      note: null,
      reason: null,
      source: "sms",
      sms_id: null,
      transfer_id: null,
      parent_id: null,
      budget_item_id: null,
      import_batch_id: null,
      original_currency: null,
      original_minor: null,
      needs_review: false,
      dedupe_key: null,
      deleted_at: "2026-10-03T06:00:00+00:00",
      deleted_reason: "duplicate",
      created_at: "2026-10-02T06:00:00+00:00",
      updated_at: "2026-10-03T06:00:00+00:00",
      version: 2,
    },
  ],
  settings: [
    {
      id: "s1",
      review_interval_days: 3,
      loan_allocation_pct: 30,
      theme: "system",
      alerts: { review: true, weekly: false },
      currency: "KES",
      month_start_day: 25,
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
      version: 1,
    },
  ],
};

/** What a value looks like once read back from CSV: text, null, or parsed JSON. */
const asRead = (v: unknown) => (v === null || v === undefined ? null : typeof v === "object" ? v : String(v));

describe("export round trip", () => {
  const { bytes, manifest, fileName } = packExport(data, now);

  it("names the file by the Nairobi date and counts every table", () => {
    expect(fileName).toBe("pesa-export-2026-11-08.zip");
    expect(manifest.tables).toMatchObject({
      accounts: 1,
      categories: 1,
      transactions: 3,
      settings: 1,
      bills: 0,
    });
    expect(Object.keys(manifest.tables)).toEqual(EXPORT_TABLES.map((t) => t.name));
  });

  it("holds a README, the manifest, one CSV per table and the readable transactions", () => {
    expect([...unzip(bytes).keys()]).toEqual([
      "README.txt",
      "manifest.json",
      ...EXPORT_TABLES.map((t) => `${t.name}.csv`),
      "transactions-readable.csv",
    ]);
  });

  it("reads back every value exactly, nulls and empty text kept apart", () => {
    const back = readExport(bytes);
    for (const [table, rows] of Object.entries(data)) {
      expect(back.tables[table]).toEqual(
        rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, asRead(v)]))),
      );
    }
    expect(back.tables.transactions![1]).toMatchObject({ payee: "", note: null, needs_review: "true" });
    expect(back.tables.settings![0]!.alerts).toEqual({ review: true, weekly: false });
    expect(back.tables.bills).toEqual([]);
  });

  it("writes a header even for an empty table", () => {
    const bills = new TextDecoder().decode(unzip(bytes).get("bills.csv"));
    expect(parseCsv(bills)).toEqual([EXPORT_TABLES.find((t) => t.name === "bills")!.columns]);
  });

  it("makes a readable file with names, Nairobi dates and KES, without deleted rows", () => {
    const rows = parseCsv(new TextDecoder().decode(unzip(bytes).get("transactions-readable.csv")));
    expect(rows).toEqual([
      ["Date", "Account", "Kind", "Category", "Payee", "Amount (KES)", "Note", "Ref", "Source", "To review"],
      ["2026-10-01", "Wallet, main", "income", "", "", "10000.00", null, null, "manual", "yes"],
      [
        "2026-11-01",
        "Wallet, main",
        "spending",
        'Food & "treats"',
        "DEMO SHOP",
        "-1500.50",
        "line one\nline two",
        "TSX0000001",
        "sms",
        "",
      ],
    ]);
  });

  it("refuses a file that is not an export, or a damaged table", () => {
    expect(() => readExport(packExport({}, now).bytes)).not.toThrow();
    const files = unzip(bytes);
    const other = new TextEncoder().encode(
      JSON.stringify({ format: "something-else", version: 1, tables: {} }),
    );
    const swapped = zip(
      [...files].map(([name, d]) => ({ name, data: name === "manifest.json" ? other : d })),
    );
    expect(() => readExport(swapped)).toThrow("not a Pesa Dashboard export");
  });
});

/** A database answering pages of `total` rows of one table, recording each range asked for. */
function pagedDb(total: number) {
  const ranges: [number, number][] = [];
  const db = {
    from: (table: string) => {
      let range: [number, number] = [0, 0];
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          range = [from, to];
          ranges.push(range);
          return builder;
        },
        then: (ok: (v: unknown) => unknown) => {
          const rows = table === "transactions" ? total : 0;
          const data = Array.from(
            { length: Math.max(0, Math.min(range[1], rows - 1) - range[0] + 1) },
            (_, i) => ({
              id: `t${range[0] + i}`,
            }),
          );
          return Promise.resolve({ data, error: null }).then(ok);
        },
      };
      return builder;
    },
  };
  return { db: db as unknown as Db, ranges };
}

describe("reading the tables", () => {
  it("pages past the API's 1,000-row limit", async () => {
    const { db, ranges } = pagedDb(2_345);
    const pages: number[] = [];
    const rows = await readTable(
      db,
      EXPORT_TABLES.find((t) => t.name === "transactions")!,
      (n) => pages.push(n),
    );
    expect(rows).toHaveLength(2_345);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(pages).toEqual([1000, 2000, 2345]);
  });

  it("asks once more after an exactly full page", async () => {
    const { db, ranges } = pagedDb(1_000);
    expect(
      await readTable(
        db,
        EXPORT_TABLES.find((t) => t.name === "transactions")!,
      ),
    ).toHaveLength(1_000);
    expect(ranges).toHaveLength(2);
  });

  it("builds the whole export, reporting progress per table", async () => {
    const { db } = pagedDb(1_500);
    const seen = new Set<string>();
    const out = await buildExport(db, now, (p) => seen.add(p.table));
    expect(out.manifest.tables.transactions).toBe(1_500);
    expect([...seen]).toEqual(EXPORT_TABLES.map((t) => t.name));
  });
});
