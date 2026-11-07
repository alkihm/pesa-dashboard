// [4.10] What "Export everything" contains: every table needed to rebuild the ledger, in an order a restore can
// insert them (each table only points at tables above it). user_id is left out — a restore sets it to whoever is
// signed in. Left out entirely: pin_credentials (a PIN hash), push_subscriptions (device keys) and backup_runs (a log).
//
// The column lists are checked against src/lib/database.types.ts: a column added to a table and not listed here
// fails the type check, so the export can never silently drop data.

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
type Columns<T extends TableName> = Exclude<keyof Tables[T]["Row"], "user_id">;

/** Lists every column of T except user_id; the type check names any column that is missing. */
function columns<T extends TableName>() {
  return <const C extends readonly Columns<T>[]>(
    list: C &
      ([Exclude<Columns<T>, C[number]>] extends [never]
        ? unknown
        : { missing: Exclude<Columns<T>, C[number]> }),
  ) => list as readonly string[];
}

export interface ExportTable {
  name: TableName;
  columns: readonly string[];
  /** Columns holding JSON (jsonb), parsed back when read. */
  json?: readonly string[];
}

// prettier-ignore
export const EXPORT_TABLES: readonly ExportTable[] = [
  { name: "accounts", columns: columns<"accounts">()(["id", "name", "kind", "emoji", "sort_order", "debt_term", "counts_in_net", "due_day", "original_cents", "limit_cents", "goal_cents", "locked_until", "sms_account_hint", "sms_sender", "archived_at", "created_at", "updated_at", "version"]) },
  { name: "categories", columns: columns<"categories">()(["id", "name", "kind", "emoji", "colour", "sort_order", "monthly_budget_cents", "system", "archived_at", "created_at", "updated_at", "version"]) },
  { name: "payee_rules", columns: columns<"payee_rules">()(["id", "pattern", "category_id", "transfer_account_id", "priority", "created_at", "updated_at", "version"]) },
  { name: "import_batches", columns: columns<"import_batches">()(["id", "file_name", "row_count", "created_at", "updated_at", "version"]) },
  { name: "sms_messages", columns: columns<"sms_messages">()(["id", "sender", "body", "received_at", "hash", "parse_status", "parser_version", "error", "created_at", "updated_at", "version"]) },
  { name: "bills", columns: columns<"bills">()(["id", "name", "emoji", "amount_cents", "due_day", "starts_on", "account_id", "category_id", "loan_account_id", "payee_match", "archived_at", "created_at", "updated_at", "version"]) },
  { name: "budget_items", columns: columns<"budget_items">()(["id", "name", "month", "amount_cents", "account_id", "category_id", "status", "approved_at", "created_at", "updated_at", "version"]) },
  { name: "transactions", columns: columns<"transactions">()(["id", "occurred_at", "account_id", "amount_cents", "kind", "category_id", "payee", "channel", "ref", "note", "reason", "source", "sms_id", "transfer_id", "parent_id", "budget_item_id", "import_batch_id", "original_currency", "original_minor", "needs_review", "dedupe_key", "deleted_at", "deleted_reason", "created_at", "updated_at", "version"]) },
  { name: "balance_snapshots", columns: columns<"balance_snapshots">()(["id", "account_id", "as_of", "balance_cents", "source", "sms_id", "created_at", "updated_at", "version"]) },
  { name: "bill_months", columns: columns<"bill_months">()(["id", "bill_id", "month", "due_on", "amount_cents", "status", "paid_at", "transaction_id", "skip_reason", "created_at", "updated_at", "version"]) },
  { name: "reviews", columns: columns<"reviews">()(["id", "started_at", "completed_at", "result", "note", "created_at", "updated_at", "version"]) },
  { name: "review_checks", columns: columns<"review_checks">()(["id", "review_id", "account_id", "ledger_cents", "stated_cents", "resolution", "transaction_id", "created_at", "updated_at", "version"]) },
  { name: "settings", columns: columns<"settings">()(["id", "review_interval_days", "loan_allocation_pct", "theme", "alerts", "created_at", "updated_at", "version"]), json: ["alerts"] },
];
