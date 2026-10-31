# Architecture

## Flow

1. **Capture.** An iPhone Shortcut runs on every incoming money SMS and POSTs
   `{ sender, body, received_at }` to the intake function with a secret key header.
2. **Intake** (Supabase Edge Function): checks the key, stores the raw message in `sms_messages`,
   parses it, de-duplicates by the reference code, writes a `transactions` row, records the
   "balance after" figure in `balance_snapshots`, applies payee rules, and marks a matching bill paid.
   Anything it cannot parse is saved as `to_review` with the raw text kept.
3. **App** (React PWA) reads and writes through Supabase with row-level security. Edits made offline
   are queued in IndexedDB and replayed when the connection returns.
4. **Backup.** A scheduled job copies the ledger to a Google Sheet every night.

## Data model (first draft — settled in issue [0.9])

| Table | Holds |
|---|---|
| `accounts` | Wallets, bank, cash, savings, loans, cards. Type, emoji, SMS sender and account suffix for matching, counts-in-net flag, limit or original amount, due day |
| `categories` | Name, emoji, colour, kind (spending / income / saving), optional monthly budget |
| `payee_rules` | "Payee contains X → category Y" |
| `sms_messages` | Raw SMS as received: sender, body, received_at, parse status |
| `transactions` | Date, account, amount (integer cents, signed), payee, category, note, source (`sms` / `manual` / `import` / `adjustment`), link to the SMS |
| `balance_snapshots` | Balance stated by an SMS, per account and time — used to reconcile |
| `bills` / `bill_months` | Recurring bills and each month's status: due, paid (via SMS or manual), skipped |
| `budget_items` | Planned spend, from-account, approved or pending |
| `reviews` | When a review was done and its result |
| `settings` | Review interval, alert switches, PIN hash and lockout state |

## Key rules

- **Net position** = sum of accounts that count in net − short-term debt. Long-term debt is shown separately.
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
