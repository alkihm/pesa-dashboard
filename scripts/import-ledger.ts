// Imports the old yearly ledger CSVs into a Supabase project ([1.3]). Real files stay outside the repo
// (private/data/ on the server); this script only reads the paths it is given.
//
//   node scripts/import-ledger.ts --env <supabase env file> --user <owner id> [--dry-run] <csv files…>
//
// The env file needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (private/env/supabase-dev.env).
// Safe to run again: rows already imported (same dedupe key) are skipped. Accounts and categories it needs are
// matched by sms_account_hint / name, or created.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { parseCsvObjects } from "../src/lib/import/csv.ts";
import { planLedgerImport, type PlannedImport } from "../src/lib/import/ledger.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const envFile = flag("--env");
const userId = flag("--user");
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => a !== "--dry-run");
if (!envFile || !userId || files.length === 0) {
  console.error(
    "usage: node scripts/import-ledger.ts --env <env file> --user <owner id> [--dry-run] <csv files…>",
  );
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1]!, m[2]!.replace(/^"|"$/g, "")]),
);
const base = `${env.VITE_SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok)
    throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status} ${await res.text()}`);
  return (
    res.status === 204 || res.headers.get("content-length") === "0" ? undefined : await res.json()
  ) as T;
}

async function getAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest<T[]>(path, { headers: { range: `${from}-${from + 999}` } });
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// ---- plan ------------------------------------------------------------------------------------------------
const plan = planLedgerImport(
  files.map((f) => ({ label: basename(f, ".csv"), rows: parseCsvObjects(readFileSync(f, "utf8")) })),
  { newId: randomUUID },
);
const t = plan.transactions;
console.log(
  "Rows read:",
  plan.rowsRead,
  "total",
  Object.values(plan.rowsRead).reduce((a, b) => a + b, 0),
);
console.log(
  `Planned: ${t.length} transactions (${t.filter((x) => x.kind === "transfer").length} transfer legs, ` +
    `${t.filter((x) => x.dedupe_key.endsWith(":peer")).length} created other legs, ${t.filter((x) => x.needs_review).length} for review)`,
);
if (plan.skipped.length) {
  const reasons = new Map<string, number>();
  for (const s of plan.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  console.log(`Skipped ${plan.skipped.length} rows:`, Object.fromEntries(reasons));
}
if (dryRun) process.exit(0);

// ---- accounts and categories -----------------------------------------------------------------------------
type Account = { id: string; kind: string; sms_account_hint: string | null; archived_at: string | null };
const accounts = await rest<Account[]>(
  `accounts?select=id,kind,sms_account_hint,archived_at&user_id=eq.${userId}`,
);
const accountId = new Map<string, string>();
for (const key of new Set(t.map((x) => x.account))) {
  const spec = plan.accounts[key]!;
  const live = accounts.filter((a) => !a.archived_at);
  let found = live.find((a) => a.sms_account_hint?.toLowerCase() === spec.key.toLowerCase());
  if (!found && spec.kind === "cash") found = live.find((a) => a.kind === "cash");
  if (!found) {
    [found] = await rest<Account[]>("accounts", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userId,
        name: spec.name,
        emoji: spec.emoji,
        kind: spec.kind,
        debt_term: spec.debt_term,
        sms_account_hint: spec.key,
        ...(spec.counts_in_net === undefined ? {} : { counts_in_net: spec.counts_in_net }),
      }),
    });
    console.log(`Created account ${spec.name}`);
  }
  accountId.set(key, found!.id);
}

type Category = { id: string; name: string; kind: string };
const categories = await rest<Category[]>(`categories?select=id,name,kind&user_id=eq.${userId}`);
const categoryId = new Map(categories.map((c) => [`${c.kind}|${c.name.trim().toLowerCase()}`, c.id]));
const EMOJI: [RegExp, string][] = [
  [/fee|levies|tax/i, "🧾"],
  [/fuel/i, "⛽"],
  [/grocer/i, "🛒"],
  [/eating|food|glovo/i, "🍽️"],
  [/airtime|data|internet|airtel/i, "📶"],
  [/rent/i, "🏠"],
  [/water/i, "🚰"],
  [/electric/i, "💡"],
  [/parking|toll|travel/i, "🚗"],
  [/health|insurance/i, "🩺"],
  [/netflix|subscription|claude/i, "📺"],
  [/church|giving/i, "⛪"],
  [/liquor/i, "🍻"],
  [/shopping|online|tingg/i, "🛍️"],
  [/person/i, "🤝"],
  [/cash/i, "💵"],
  [/reversal/i, "↩️"],
  [/salary|bonus|arrears|income/i, "💼"],
  [/card|bank/i, "💳"],
];
let colour = categories.length;
for (const key of new Set(t.filter((x) => x.category).map((x) => `${x.category_kind}|${x.category}`))) {
  const [kind, name] = key.split("|") as [string, string];
  if (categoryId.has(`${kind}|${name.toLowerCase()}`)) continue;
  const [made] = await rest<Category[]>("categories", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      name,
      kind,
      emoji: EMOJI.find(([re]) => re.test(name))?.[1] ?? "🏷️",
      colour: `cat-${(colour++ % 12) + 1}`,
    }),
  });
  categoryId.set(`${kind}|${name.toLowerCase()}`, made!.id);
}

// ---- skip what is already there --------------------------------------------------------------------------
const existing = new Set(
  (
    await getAll<{ dedupe_key: string }>(
      `transactions?select=dedupe_key&user_id=eq.${userId}&dedupe_key=like.ledger:*`,
    )
  ).map((x) => x.dedupe_key),
);
const groups = new Map<string, PlannedImport[]>();
for (const x of t) if (x.transfer_id) groups.set(x.transfer_id, [...(groups.get(x.transfer_id) ?? []), x]);
const fresh = t.filter((x) =>
  x.transfer_id
    ? groups.get(x.transfer_id)!.every((l) => !existing.has(l.dedupe_key))
    : !existing.has(x.dedupe_key),
);
const freshIds = new Set(fresh.map((x) => x.id));
console.log(`Already imported: ${t.length - fresh.length}. To insert: ${fresh.length}.`);
if (fresh.length === 0) process.exit(0);

const [batch] = await rest<{ id: string }[]>("import_batches", {
  method: "POST",
  headers: { prefer: "return=representation" },
  body: JSON.stringify({
    user_id: userId,
    file_name: files.map((f) => basename(f)).join(", "),
    row_count: fresh.length,
  }),
});

const toRow = (x: PlannedImport) => ({
  id: x.id,
  user_id: userId,
  occurred_at: x.occurred_at,
  account_id: accountId.get(x.account)!,
  amount_cents: x.amount_cents,
  kind: x.kind,
  category_id: x.category ? categoryId.get(`${x.category_kind}|${x.category.toLowerCase()}`)! : null,
  transfer_id: x.transfer_id,
  parent_id: x.parent_id && freshIds.has(x.parent_id) ? x.parent_id : null,
  payee: x.payee,
  channel: x.channel,
  note: x.note,
  source: "import",
  ref: x.ref,
  dedupe_key: x.dedupe_key,
  needs_review: x.needs_review,
  original_currency: x.original_currency,
  original_minor: x.original_minor,
  import_batch_id: batch!.id,
});

// Units: a transfer is both its legs (one request, checked at commit); anything else is one row. Payments go
// before fees so every parent_id already exists.
const units: PlannedImport[][] = [];
const placed = new Set<string>();
for (const x of [...fresh.filter((y) => y.channel !== "fee"), ...fresh.filter((y) => y.channel === "fee")]) {
  if (placed.has(x.id)) continue;
  const unit = x.transfer_id ? groups.get(x.transfer_id)! : [x];
  unit.forEach((u) => placed.add(u.id));
  units.push(unit);
}
const chunks: PlannedImport[][] = [[]];
for (const unit of units) {
  if (chunks.at(-1)!.length + unit.length > 500) chunks.push([]);
  chunks.at(-1)!.push(...unit);
}

let inserted = 0;
for (const c of chunks) {
  await rest("transactions", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(c.map(toRow)),
  });
  inserted += c.length;
  process.stdout.write(`\rInserted ${inserted}/${fresh.length}`);
}
console.log(`\nDone. Import batch ${batch!.id}.`);
