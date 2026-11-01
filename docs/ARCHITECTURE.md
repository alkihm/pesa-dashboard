# Architecture

## Flow

1. **Capture.** An iPhone Shortcut runs on every incoming money SMS and POSTs
   `{ sender, body, received_at }` to the intake function with a secret key header.
2. **Intake** (`supabase/functions/intake`): checks the key, parses the message (`src/lib/sms`), matches
   accounts and applies payee rules (`src/lib/intake/plan.ts`), then `ingest_sms` stores the raw message and
   its rows and balance readings in one database transaction. A repeat message (same hash) or a payment
   already recorded by another message (same `dedupe_key`) writes nothing. A transfer a payee rule names
   creates the other leg flagged for review; when the other account's SMS arrives it claims that leg.
   Anything it cannot parse or place is saved as `to_review` with the raw text kept. One-time codes are
   never stored. Marking a bill paid comes with [3.2].
3. **App** (React PWA) reads and writes through Supabase with row-level security. Edits made offline
   are queued in IndexedDB and replayed when the connection returns.
4. **Backup.** At 23:30 Nairobi time pg_cron calls `public.run_sheet_backup()`, which posts to the
   `sheet-backup` Edge Function. It rewrites one tab per year of a Google Sheet with the whole ledger and logs
   the run in `backup_runs` (status, rows, tabs, error), which Settings shows. See D-013.

## Data model

Settled in [0.9]; the reasons are in [DECISIONS.md](DECISIONS.md) D-009. Migrations follow this.

Every table has `id uuid` (primary key; the app may create it while offline), `user_id uuid` (row-level
security: `user_id = auth.uid()`), `created_at`, `updated_at` and `version int` (bumped on every update;
an offline edit is sent with the version it started from). Money columns end in `_cents` and are `bigint`.
Fixed lists are `text` with a `check`, not Postgres enums. "Archived" means `archived_at` is set: hidden
from pickers, kept in history.

### `accounts`

| Column | Notes |
|---|---|
| `name`, `emoji` | |
| `kind` | `wallet` · `bank` · `cash` · `savings` · `loan` · `card` (an overdraft is a `loan`) |
| `debt_term` | `short` · `long` — loans and cards only; the two debt groups of R2 |
| `counts_in_net` | Defaults: true for wallet, bank, cash, savings and short-term debt; false for long-term debt (D-010) |
| `sms_sender`, `sms_account_hint` | `sms_account_hint` is the parser's account key that lands here, ignoring case: `mpesa`, `fuliza`, `mshwari`, `kcb-mpesa` (its savings side), `kcb-mpesa-loan`, `airtel-money`, a bank name (`KCB`) or a card (`KCB card 0042`). Cash goes to the `cash` account. An SMS for an account nobody claims goes to review |
| `limit_cents` | Card or overdraft limit |
| `original_cents` | Loan principal, for the progress bar |
| `due_day` | 1–31, repayment day of a loan or card |
| `sort_order` | Home shows the first four |
| `archived_at` | |

No balance column. An account's balance is the sum of its live transactions (view `account_balances`).
Debt accounts have negative balances.

### `categories`

| Column | Notes |
|---|---|
| `name`, `emoji` | |
| `colour` | Palette key (`cat-1` … `cat-12`) defined in the design tokens for both themes — never a hex value |
| `kind` | `spending` · `income` |
| `monthly_budget_cents` | Optional |
| `system` | True for categories the intake relies on (Transaction fees, Uncategorised); cannot be archived |
| `sort_order`, `archived_at` | |

### `payee_rules`

`pattern` (case-insensitive "payee contains"), `priority` (lowest first, first match wins), and exactly one of
`category_id` (→ spending or income) or `transfer_account_id` (→ a transfer to that account, e.g. a Sacco
deposit or a loan repayment). Rules apply to each new message in the intake; `apply_payee_rule(rule, overwrite, dry_run)`
applies one to past rows (by default only uncategorised ones; `dry_run` returns the count for the screen).

### `sms_messages`

`sender`, `body`, `received_at`, `hash` (sha-256 of sender and body, unique — drops repeat posts),
`parse_status` (`parsed` · `ignored` · `to_review`), `parser_version`, `error`. Never deleted. One-time
codes are dropped at intake and never stored.

### `transactions`

| Column | Notes |
|---|---|
| `occurred_at` | When the money moved: the time in the SMS text, else `received_at` |
| `account_id` | |
| `amount_cents` | Signed effect on this account's balance; never 0 |
| `kind` | `spending` · `income` · `transfer` · `adjustment` · `opening` |
| `category_id` | Spending and income only; null means uncategorised |
| `transfer_id` | Shared by the two legs of a transfer |
| `parent_id` | A fee row points at the payment it came with |
| `payee` | Cleaned name (phone digits stripped); the full text stays in the SMS |
| `channel` | As the SMS says it: till, paybill, send, withdrawal, airtime, card… (optional) |
| `note` | R18 |
| `reason` | Required for `adjustment` |
| `source` | `sms` · `manual` · `import` |
| `sms_id` | The message it came from; a payment and its fee share one |
| `ref` | The M-PESA or bank code, shown and searchable |
| `dedupe_key` | From the parser, unique when present: `<source>:<ref>:<entry>` (`mpesa:<ref>:main`, `mpesa:<ref>:fee`), or `<source>:<minute>:<amount>:<entry>` when the SMS has no code |
| `original_currency`, `original_minor` | Foreign card purchases: the amount as charged; `amount_cents` is the KES estimate |
| `needs_review` | Parser unsure, uncategorised, or a foreign-currency estimate |
| `budget_item_id` | The approved budget item this spends |
| `import_batch_id` | The bulk upload that created it |
| `deleted_at`, `deleted_reason` | Soft delete; deleted rows count nowhere |

Editing: category, payee and note can always change. Amount, account and date change only on
`manual` or `import` rows, or while `needs_review` is set.

A transfer is two rows with the same `transfer_id`, on different accounts, amounts summing to zero —
checked by a deferred constraint trigger at commit. Borrowing is a transfer out of a loan account,
a repayment a transfer into it, saving a transfer into a savings account; interest and fees are spending.

### `balance_snapshots`

`account_id`, `balance_cents`, `as_of`, `source` (`sms` · `manual`), `sms_id`. Unique per (`sms_id`,
`account_id`). Reconcile compares the **latest** snapshot of each account with the sum of its transactions
up to `as_of`.

### `bills` and `bill_months`

`bills`: `name`, `emoji`, `amount_cents` (expected; may be an estimate), `due_day`, `account_id` (usually
paid from), `category_id`, `payee_match` (marks the month paid when a matching SMS arrives), `starts_on`,
`archived_at`. Monthly only.

`bill_months`: `bill_id`, `month` (first day), `due_on` and `amount_cents` (copied from the bill when the
row is made), `status` (`due` · `paid` · `skipped`), `transaction_id` (what paid it), `paid_at`,
`skip_reason`. Unique per (`bill_id`, `month`). Rows are made by the idempotent `ensure_bill_months(month)`
function. Colours are not stored: they come from `status` and days from today to `due_on`.

### `budget_items`

`name`, `amount_cents`, `account_id` (from), `category_id`, `month`, `status` (`pending` · `approved` ·
`done` · `cancelled`), `approved_at`. Approval never moves money: an approved item is set aside from the
account's available amount until transactions with its `budget_item_id` spend it.

### `reviews` and `review_checks`

`reviews`: `started_at`, `completed_at`, `result` (`all_match` · `fixed` · `left_open`), `note`.
`review_checks`: one row per account per review — `ledger_cents`, `stated_cents`, `resolution`
(`matched` · `added_transaction` · `adjustment` · `left_open`), `transaction_id`.

### `import_batches`

`file_name`, `row_count`, `created_at`. Lets a bad bulk upload (R21) be found and deleted as one.

### `settings`, `pin_credentials`, `push_subscriptions`

`settings` (one row): `review_interval_days` (default 3), `alerts` (jsonb switches), `theme`
(`system` · `light` · `dark`), `loan_allocation_pct`.
`pin_credentials`: `pin_hash`, `failed_attempts`, `locked_until`. No client policy at all — read and
written only through the `verify_pin` and `set_pin` functions.
`push_subscriptions`: `endpoint`, `keys`, `device_label`.

### Views

`account_balances` (balance, latest snapshot and its source, difference at the snapshot's time, last activity, emoji, sort order, archived; maths for the screens in `src/lib/balances.ts`), `month_totals` (income,
spending, fees, borrowed, repaid, saved per Nairobi month) and `category_month_totals`. All views use
`security_invoker`, so row-level security applies. Months are grouped in `Africa/Nairobi` time.

### Where each screen's data comes from

| Screen | Tables and views |
|---|---|
| PIN sign-in | Supabase auth (Google), `pin_credentials` via `verify_pin` |
| Home · Overview | `account_balances`, `accounts`, `month_totals`, `category_month_totals`, `bill_months`, `settings.loan_allocation_pct` |
| Month & compare | `month_totals`, `category_month_totals`, `transactions` |
| Activity · edit categories | `transactions`, `sms_messages` (original text), `categories`, `payee_rules` ("always use this category") |
| Add transaction | `transactions` (manual, or a transfer pair), `accounts`, `categories` |
| Bills & budget | `bills`, `bill_months`, `budget_items`, `month_totals` (income) |
| Review & reconcile | `account_balances`, `balance_snapshots`, `reviews`, `review_checks`, `transactions` (adjustments, `needs_review`), `sms_messages` (`to_review`) |
| Accounts, savings, debt, new account | `accounts`, `account_balances` |
| Categories, new category | `categories`, `category_month_totals` |
| Settings | `settings`, `set_pin`, `push_subscriptions`, latest `sms_messages.received_at` (sync status); the offline queue is IndexedDB on the device |
| Month report · PDF | `month_totals`, `category_month_totals`, `bill_months`, `account_balances` |
| Bulk upload (R21) | `import_batches`, `transactions` |

## Key rules

- **Net position** = sum of the balances of accounts that count in net: wallets, bank, cash and savings.
  Short-term debt is negative, so it
  subtracts. Long-term debt is shown separately.
- **Bill status** comes from days to the due date: overdue or due today → red, ≤3 days → orange,
  ≤7 → amber, later → blue, paid → green, skipped → grey.
- **Review status**: green within the interval and all balances match; amber after the interval;
  red after twice the interval plus one day, or at once when any balance differs from its latest SMS.
- **Reconcile**: ledger balance vs latest SMS balance per account. A difference is fixed by adding the
  missing transaction or by an `adjustment` transaction with a reason — history is never edited.
- **Offline**: queued edits replay in order; a change to a row that was changed on the server since the
  queue item was made is shown for the user to choose, never silently overwritten.

## Environments

| | Database | App |
|---|---|---|
| Dev | Supabase dev project | Local + preview per pull request |
| Prod | Supabase prod project | Deployed from `main` |
