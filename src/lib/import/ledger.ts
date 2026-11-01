// Maps rows of the old yearly ledgers (12 columns: Date, Month, Account, Type, Description, Class, Category,
// Currency, Amount (orig), Amount (KES), Ref, Note) to transactions, following D-009 and its column map.
//
// History is imported as the old ledger recorded it. Own-money moves, borrowing, repayments and saving become
// transfers between accounts; where the ledger has only one side, the other leg is created. Flows the old
// ledger never tracked (cash spending, Fuliza draws) are not invented: cash withdrawals and Fuliza fees stay
// spending on the account they were recorded on.

import { cleanPayee } from "../sms/text.ts";

export type LedgerRow = Record<string, string>;

export interface AccountSpec {
  key: string; // goes into accounts.sms_account_hint
  name: string;
  emoji: string;
  kind: "wallet" | "bank" | "cash" | "savings" | "loan" | "card";
  debt_term: "short" | "long" | null;
  counts_in_net?: boolean;
}

/** Accounts the intake also knows (their keys are the SMS parser's). Others are derived from the ledger text,
 *  so no lender, Sacco or card provider is named in this public code. */
const KNOWN: Record<string, AccountSpec> = {
  mpesa: { key: "mpesa", name: "M-PESA", emoji: "📱", kind: "wallet", debt_term: null },
  kcb: { key: "KCB", name: "KCB", emoji: "🏦", kind: "bank", debt_term: null },
  "kcb card": { key: "kcb card", name: "KCB card", emoji: "💳", kind: "bank", debt_term: null },
  cash: { key: "cash", name: "Cash", emoji: "💵", kind: "cash", debt_term: null },
  mshwari: { key: "mshwari", name: "M-Shwari", emoji: "💰", kind: "savings", debt_term: null },
  "kcb-mpesa": {
    key: "kcb-mpesa",
    name: "KCB M-PESA savings",
    emoji: "🏧",
    kind: "savings",
    debt_term: null,
  },
  "kcb-mpesa-loan": {
    key: "kcb-mpesa-loan",
    name: "KCB M-PESA loan",
    emoji: "🏧",
    kind: "loan",
    debt_term: "short",
  },
  sacco: { key: "sacco", name: "Sacco", emoji: "🐷", kind: "savings", debt_term: null },
  pension: { key: "pension", name: "Pension", emoji: "🧓", kind: "savings", debt_term: null },
};

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The account a ledger "Account" value means. Unknown names become their own account. */
function ledgerAccount(name: string, specs: Map<string, AccountSpec>): string {
  if (/^m-?pesa$/i.test(name)) return "mpesa";
  if (/^kcb$/i.test(name)) return "kcb";
  if (/sacco/i.test(name)) return "sacco";
  const key = slug(name);
  if (!specs.has(key)) {
    const card = /card/i.test(name);
    const airtime = /airtime/i.test(name);
    specs.set(key, {
      key,
      name,
      emoji: card ? "💳" : airtime ? "📶" : "🏦",
      kind: airtime ? "wallet" : "bank",
      debt_term: null,
      ...(airtime ? { counts_in_net: false } : {}),
    });
  }
  return key;
}

/** "Loan - X" / "Loan repayment - X" → the loan account for lender X. */
function loanAccount(category: string, type: string, specs: Map<string, AccountSpec>): string | undefined {
  const lender = category.replace(/^Loan( repayment)? - /i, "").trim();
  if (!lender || lender === category) return undefined;
  if (/^kcb$/i.test(lender) && /M-?PESA/i.test(type)) return "kcb-mpesa-loan";
  const base = slug(lender);
  const key = base.endsWith("loan") ? base : `${base}-loan`;
  if (!specs.has(key)) {
    const name = /loan$/i.test(lender) ? lender : `${lender} loan`;
    const long = /car|mortgage|student|university|hire purchase/i.test(lender);
    specs.set(key, { key, name, emoji: "💸", kind: "loan", debt_term: long ? "long" : "short" });
  }
  return key;
}

export interface PlannedImport {
  id: string;
  account: string; // key into ACCOUNTS
  occurred_at: string;
  amount_cents: number;
  kind: "spending" | "income" | "transfer";
  category: string | null; // category name
  category_kind: "spending" | "income" | null;
  transfer_id: string | null;
  parent_id: string | null;
  payee: string | null;
  channel: string | null;
  note: string | null;
  ref: string | null;
  dedupe_key: string;
  needs_review: boolean;
  original_currency: string | null;
  original_minor: number | null;
  /** Which ledger row this came from: "<file label> row <n>"; created other legs say "(other leg)". */
  source_row: string;
}

export interface ImportPlan {
  transactions: PlannedImport[];
  /** Every account the transactions use, keyed like PlannedImport.account. */
  accounts: Record<string, AccountSpec>;
  /** Ledger rows read, per file label. */
  rowsRead: Record<string, number>;
  /** Rows that could not be mapped, with the reason. */
  skipped: { source_row: string; reason: string }[];
}

/** "1,234.567" or "-701" → signed cents, rounding half away from zero on the third decimal. No floats. */
export function amountToCents(text: string): number | undefined {
  const m = /^(-)?\s*(\d[\d,]*)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return undefined;
  const whole = Number(m[2]!.replace(/,/g, ""));
  const frac = (m[3] ?? "").padEnd(3, "0");
  const cents = whole * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return m[1] ? -cents : cents;
}

/** Stable short hash (FNV-1a, 2×32 bits) for dedupe keys. */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const COLUMNS = [
  "Date",
  "Account",
  "Type",
  "Description",
  "Class",
  "Category",
  "Currency",
  "Amount (orig)",
  "Amount (KES)",
  "Ref",
  "Note",
];

function channelOf(row: LedgerRow): string | null {
  const t = row.Type ?? "";
  if (/fee/i.test(t)) return "fee";
  if (/till/i.test(t)) return "till";
  if (/airtime/i.test(t)) return "airtime";
  if (/withdrawal/i.test(t)) return "withdrawal";
  if (/card/i.test(t)) return "card";
  if (/reversal/i.test(t)) return "reversal";
  if (/received|deposit|credit|salary/i.test(t)) return "receive";
  if (/payroll|loan/i.test(t)) return "loan";
  if (/paybill|send/i.test(t)) return /^acct/i.test(row.Note ?? "") ? "paybill" : "send";
  return null;
}

/** Own-money moves: which account the row is on is one leg; this gives the other account and the direction. */
function transferLeg(
  row: LedgerRow,
  account: string,
): { peer: string; out: boolean; review: boolean } | undefined {
  const cat = row.Category ?? "";
  const note = row.Note ?? "";
  switch (cat) {
    case "Own transfer (KCB to M-PESA)":
      return account === "kcb"
        ? { peer: "mpesa", out: true, review: false }
        : { peer: "kcb", out: false, review: false };
    case "Own transfer (M-PESA to KCB)":
      return account === "mpesa"
        ? { peer: "kcb", out: true, review: false }
        : { peer: "mpesa", out: false, review: false };
    case "Own transfer (KCB account to card)":
      return { peer: "kcb card", out: true, review: false };
    case "Own transfer (M-Shwari)":
      return { peer: "mshwari", out: !/\bfrom\b/i.test(note), review: false };
    case "Cash deposit to M-PESA":
      return { peer: "cash", out: false, review: false };
    case "Own transfer (savings)":
      // Sends to the owner's own name or "Short-term Savings": the savings pot is not named in the ledger.
      return { peer: "kcb-mpesa", out: !/received/i.test(row.Type ?? ""), review: true };
    default:
      return undefined;
  }
}

export interface PlanOptions {
  /** Makes ids; injectable so tests are deterministic. */
  newId: () => string;
}

export function planLedgerImport(
  files: { label: string; rows: LedgerRow[] }[],
  { newId }: PlanOptions,
): ImportPlan {
  const transactions: PlannedImport[] = [];
  const skipped: ImportPlan["skipped"] = [];
  const rowsRead: Record<string, number> = {};
  const seen = new Map<string, number>();
  const pending: PlannedImport[] = []; // transfer legs waiting for their other side
  const peerOf = new Map<PlannedImport, string>();
  const specs = new Map<string, AccountSpec>(Object.entries(KNOWN));

  for (const { label, rows } of files) {
    rowsRead[label] = rows.length;
    rows.forEach((row, i) => {
      const source_row = `${label} row ${i + 2}`; // +1 for the header, +1 for 1-based
      const fingerprint = COLUMNS.map((c) => row[c] ?? "").join("␟");
      const n = (seen.get(fingerprint) ?? 0) + 1;
      seen.set(fingerprint, n);
      const dedupe_key = `ledger:${hash(fingerprint)}:${n}`;

      const account = row.Account ? ledgerAccount(row.Account, specs) : undefined;
      const cents = amountToCents(row["Amount (KES)"] ?? "");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(row.Date ?? "") ? row.Date! : undefined;
      if (!account) return skipped.push({ source_row, reason: "no account" });
      if (cents === undefined || cents === 0) return skipped.push({ source_row, reason: "no amount" });
      if (!date) return skipped.push({ source_row, reason: "no date" });

      const foreign = row.Currency && row.Currency !== "KES";
      const base: PlannedImport = {
        id: newId(),
        account,
        occurred_at: `${date}T09:00:00.000Z`, // noon in Nairobi: the ledgers keep only the day
        amount_cents: 0,
        kind: "spending",
        category: null,
        category_kind: null,
        transfer_id: null,
        parent_id: null,
        payee: cleanPayee(row.Description) ?? null,
        channel: channelOf(row),
        note: row.Note || null,
        ref: row.Ref || null,
        dedupe_key,
        needs_review: false,
        original_currency: foreign ? row.Currency! : null,
        original_minor: foreign ? (amountToCents(row["Amount (orig)"] ?? "") ?? null) : null,
        source_row,
      };
      if (foreign) base.needs_review = true;

      const cls = row.Class ?? "";
      const cat = row.Category ?? "";

      if (cls === "Expense" || cls === "Income" || cls === "To review") {
        const income = cls === "Income";
        // Spending is negative; a negative ledger amount on an expense was money back (a refund).
        const row_ = {
          ...base,
          kind: income ? ("income" as const) : ("spending" as const),
          amount_cents: income ? cents : -cents,
        };
        if (cls === "To review" || /uncategorised/i.test(cat) || !cat) row_.needs_review = true;
        else {
          row_.category = cat;
          row_.category_kind = income ? "income" : "spending";
          if (/\(check\)|verify/i.test(cat + " " + (row.Note ?? ""))) row_.needs_review = true;
        }
        transactions.push(row_);
        return;
      }

      let leg: { peer: string; out: boolean; review: boolean } | undefined;
      if (cls === "Transfer") leg = transferLeg(row, account);
      else if (cls === "Borrowing") {
        const loan = loanAccount(cat, row.Type ?? "", specs);
        leg = loan ? { peer: loan, out: false, review: false } : undefined;
      } else if (cls === "Debt repayment") {
        const loan = loanAccount(cat, row.Type ?? "", specs);
        leg = loan ? { peer: loan, out: true, review: false } : undefined;
      } else if (cls === "Saving") {
        const pot = /pension/i.test(cat) ? "pension" : "sacco";
        // A Sacco-side "account transaction" does not say where the money came from.
        leg =
          account === pot
            ? { peer: "mpesa", out: false, review: true }
            : { peer: pot, out: true, review: false };
      }
      if (!leg) return skipped.push({ source_row, reason: `no rule for ${cls} / ${cat}` });

      const me: PlannedImport = {
        ...base,
        kind: "transfer",
        amount_cents: leg.out ? -cents : cents,
        needs_review: base.needs_review || leg.review,
      };
      transactions.push(me);
      pending.push(me);
      peerOf.set(me, leg.peer);
    });
  }

  // Pair legs the ledger recorded on both accounts (e.g. a KCB send and the M-PESA receipt): opposite amounts,
  // each other's accounts, within 3 days, closest first. Unpaired legs get their other leg created.
  const DAY = 86_400_000;
  const open = new Set(pending);
  for (const t of pending) {
    if (!open.has(t)) continue;
    open.delete(t);
    let best: PlannedImport | undefined;
    for (const o of open) {
      if (o.account !== peerOf.get(t) || peerOf.get(o) !== t.account || o.amount_cents !== -t.amount_cents)
        continue;
      const gap = Math.abs(Date.parse(o.occurred_at) - Date.parse(t.occurred_at));
      if (gap > 3 * DAY) continue;
      if (!best || gap < Math.abs(Date.parse(best.occurred_at) - Date.parse(t.occurred_at))) best = o;
    }
    const tid = newId();
    t.transfer_id = tid;
    if (best) {
      open.delete(best);
      best.transfer_id = tid;
    } else {
      transactions.push({
        ...t,
        id: newId(),
        account: peerOf.get(t)!,
        amount_cents: -t.amount_cents,
        payee: null,
        note: `Other leg of ${t.source_row}, not in the ledger`,
        dedupe_key: `${t.dedupe_key}:peer`,
        source_row: `${t.source_row} (other leg)`,
      });
    }
  }

  // A fee row points at the payment it came with: same ref, same account, not itself a fee.
  const mains = new Map<string, string>();
  for (const t of transactions)
    if (t.ref && t.channel !== "fee" && t.kind !== "transfer") mains.set(`${t.ref}|${t.account}`, t.id);
  for (const t of transactions)
    if (t.ref && t.channel === "fee") t.parent_id = mains.get(`${t.ref}|${t.account}`) ?? null;

  const used = new Set(transactions.map((t) => t.account));
  const accounts = Object.fromEntries([...specs].filter(([k]) => used.has(k)));
  return { transactions, accounts, rowsRead, skipped };
}
