# Decisions

Newest last. Each entry: what was decided, why, and what it rules out. Add one whenever a choice would be
hard to reverse or someone would otherwise ask "why is it like this?". Spikes (`type:spike`) end here.

## D-001 · 2026-10-31 · Web app on a real database, not Sheets

**Decided:** An installable web app (PWA) on Supabase (Postgres, Google sign-in, Edge Functions).
The iPhone Shortcut stays; it posts to an intake function instead of the Sheet. The Google Sheet becomes a
nightly read-only backup.
**Why:** Apps Script + Sheets was slow, could not keep raw SMS per transaction, and made offline edits and
multi-device use fragile. A PWA gives one codebase for phone, tablet and desktop with home-screen install,
offline and iOS push.
**Rules out:** A native App Store app; Sheets as the source of truth.

## D-002 · 2026-10-31 · Stack

**Decided:** React + TypeScript (strict) + Vite, pnpm, Vitest, ESLint + Prettier. Supabase JS client.
IndexedDB for the offline queue. Hosting: Vercel or Cloudflare Pages, chosen in [0.4].
**Why:** Static app with no server rendering needs; Vite keeps PWA/offline simple. Same tooling family as
the owner's other projects.

## D-003 · 2026-10-31 · Public repository, code only

**Decided:** `alkihm/pesa-dashboard`, public, personal account. Real data, statements, Sheet IDs, keys and
PINs never enter the repo or its history. Fixtures are invented. Commits use the GitHub no-reply email.
**Why:** The owner wanted it public. Public history is permanent, so the guard rails are strict.

## D-004 · 2026-10-31 · Branches and issues

**Decided:** `dev` default, `main` production, both protected (PR only, linear history, no force-push).
One issue per branch, squash-merged into `dev`. Issues numbered `[milestone.n]` with `epic:*`, `P0–P2`,
`type:*`, `laptop:A/B` labels, milestones M0–M5 — the same pattern as the owner's broll-core project.

## D-005 · 2026-10-31 · One person, two laptops, all building on the home server

**Decided:** Code lives and runs on the home server. Laptop A is **Hydracore**, laptop B is **Alfie**. Each has
its own clone (workspace) on the server and connects with VS Code Remote-SSH. Laptops never edit each
other's workspace and never keep a second copy on their own disk. GitHub is the only way code moves
between workspaces. See [WORKFLOW.md](WORKFLOW.md).
**Why:** The owner hosts and tests builds on the server; one machine with Docker for both laptops; phone
testing over the home network or Tailscale.
**Rules out:** Syncing the project with Syncthing or a shared network drive — the project folder is excluded
from Syncthing because syncing `.git` and `node_modules` corrupts repositories.

## D-006 · 2026-10-31 · Local Supabase on the server for development

**Decided:** Development uses the Supabase CLI's local stack in Docker on the server — one shared dev
database for both workspaces. The cloud Supabase projects (dev preview, prod) come in with [0.3]/[0.4].
The existing `ledger-postgres` container belongs to an older project and is not reused.
**Why:** The local stack matches production (auth, row-level security, Edge Functions) and is free and fast.
A plain Postgres container would not.
**Consequence:** Only one open pull request may change the database schema at a time (label `db-migration`).

## D-007 · 2026-10-31 · Money and time

**Decided:** Money stored as integer cents (`bigint`), signed (out negative, in positive). Timestamps stored in
UTC, shown in `Africa/Nairobi`. History is never edited to fix balances — differences are corrected with
`adjustment` transactions that carry a reason.

## D-008 · 2026-10-31 · Testing ladder

**Decided:** Test on the fastest rung first: unit tests → dev server in your workspace (open on laptop and
phone) → integration preview of `dev` on the server → hosting preview per pull request → production from `main`.

## D-009 · 2026-10-31 · Data model

**Decided:** The tables and rules in [ARCHITECTURE.md](ARCHITECTURE.md) "Data model", built on D-007. The
choices behind it:

1. **Balances are worked out, never stored.** An account's balance is the sum of its live transactions.
   **Why:** one source of truth; reconciling compares that sum with the SMS balance, and nothing can drift.
2. **The sign is the effect on the account; `kind` says what the money was.** Spending is negative and
   income positive; a refund is positive spending in the same category, so the category total goes down.
   Loans and cards carry negative balances. **Why:** a balance is a plain sum for every kind of account.
   The old ledger stored positive amounts plus a class, so every total needed its own rule per class.
3. **A transfer is two rows sharing a `transfer_id`, summing to zero.** Borrowing, repaying a loan, saving
   and an overdraft draw are all transfers between your own accounts; interest and fees are spending.
   The old classes Borrowing, Debt repayment and Saving become views over transfers by account kind.
   **Why:** each account stays correct on its own and can be checked against its own SMS. Own money
   moving is never counted as income or spending.
   **Consequence for [1.4]:** an overdraft draw must be written as a transfer from the overdraft account.
   The old ledger skipped draws, which would leave the wallet out of line with its SMS balance.
4. **Fees are their own spending rows**, pointing at their payment with `parent_id`. **Why:** fees show
   up in "Where the money went", as they did in the old ledger, and the payment keeps its real amount.
5. **Corrections never edit history.** A missing payment is added; a remaining difference becomes an
   `adjustment` with a reason. The starting balance of an account is one `opening` row. Amounts and
   accounts on SMS rows are locked unless the row needs review. **Why:** keeps the ledger matching what
   the bank said (D-007), and keeps adjustments out of income and spending totals.
6. **Duplicates are stopped twice.** `sms_messages.hash` drops the same message posted again;
   `transactions.dedupe_key` drops the same payment reported by a second message (two senders, a bank's
   copy of an M-PESA payment, two loan-repayment notices). **Why:** the old Shortcut fired twice and banks
   repeat M-PESA payments; both happen in practice.
7. **Bill months are stored rows**, made by an idempotent `ensure_bill_months(month)`. Only `due`, `paid`
   and `skipped` are stored; the colour comes from the days to `due_on`. `due_on` and the amount are
   copied when the row is made. **Why:** skipping and paying need a row to live on, and changing a bill
   must not rewrite past months.
8. **Delete or archive:** accounts, categories and bills are archived once anything uses them (foreign keys
   stop a hard delete). Transactions are soft-deleted with a reason. SMS messages, bill months and
   reviews are never deleted; budget items are cancelled. Payee rules and push subscriptions are deleted
   for real. **Why:** history and reports stay whole; a soft-deleted SMS row keeps its `dedupe_key`, so a
   resent message cannot bring it back; offline deletes can be checked for conflicts like any other edit.
9. **IDs are UUIDs the app can make, and every row has a `version`.** **Why:** offline-created rows can be
   referenced before they sync, and a replayed edit whose version is stale is shown to the user instead of
   overwriting (R25).
10. **The PIN hash sits in a table the app cannot read**, reachable only through `verify_pin` and `set_pin`.
    **Why:** a 4–6 digit PIN hash can be cracked in moments if the client can read it.
11. **Categories are only `spending` or `income`** (the draft also had `saving`). Saving is a transfer into a
    savings account. **Why:** a Sacco deposit would otherwise count both as a transfer and as a saving
    category. Something saved without an account (a pension, say) gets a savings account with
    `counts_in_net` off.
12. **Category colours are palette keys** (`cat-1` … `cat-12`) defined in the design tokens. **Why:** no hex
    values in components, and each colour needs a light and a dark version. [0.5] adds the palette.
13. **Accounts are KES.** A foreign card purchase keeps the charged amount in `original_currency` and
    `original_minor`, books a KES estimate and is flagged for review until the statement amount is known.

**Old ledger columns, for the history import:** Date → `occurred_at` · Month → worked out · Account →
`account_id` · Type → `channel` · Description → `payee` · Class → `kind` (Expense → spending, Income →
income, Transfer / Borrowing / Debt repayment / Saving → transfer with the matching account,
To review → `needs_review`) · Category → `category_id` · Currency and Amount → `original_currency`,
`original_minor` · Amount (KES) → `amount_cents` with the sign from rule 2 · Ref → `ref` · Note → `note`.

**Rules out:** a stored balance column; one-row transfers with from/to columns; hard-deleting transactions;
a `saving` category kind; editing the amount of an SMS transaction that is not under review.

## D-010 · 2026-11-01 · Savings count in net position

**Decided:** Net position = wallets + bank + cash + savings − short-term debt. Long-term debt (car loan, card)
stays on its own card, as before. New savings accounts get `counts_in_net` on by default; it can still be
switched off per account. Changes R6 and the default in D-009.
**Why:** The owner wants net position to be "my balances and savings minus debts". Savings such as KCB
M-PESA savings and M-Shwari are the owner's money, even if not spent day to day.
**Rules out:** Net position as spendable money only. The Savings card still shows savings on their own (R3).


## D-011 · 2026-11-01 · Hosting on Vercel

**Decided:** The app is hosted on Vercel, connected to the GitHub repo. Production deploys from `main`; every other
branch and pull request gets its own preview link. `vercel.json` sends every route to `index.html` (client-side
routing) and keeps `sw.js` and the manifest uncached so app updates reach installed phones. Supabase settings are
Vercel environment variables: Production uses the prod project, Preview uses the dev project. The owner's own
preview of `dev` stays at pesa-dev.autotechfy.com on the server (see SERVER.md).
**Why:** Owner's choice. Preview per pull request with no setup, Vercel Authentication keeps previews private by
default, and the Vite preset needs no build configuration.
**Rules out:** Cloudflare Pages (the alternative named in the README) and self-hosting production on the server.

## D-012 · 2026-11-01 · How the old ledgers are imported

**Decided:** `scripts/import-ledger.ts` imports the yearly ledger CSVs ([1.3]) with these rules:

1. **As recorded.** Own-money moves, borrowing, repayments and saving become transfers (D-009 rule 3). Where
   the ledger has the move on both accounts (a KCB send and its M-PESA receipt: opposite amounts, within 3
   days) the two rows are paired; otherwise the other leg is created and noted.
2. **Nothing invented.** The old ledger never tracked cash spending or Fuliza draws, so historic cash
   withdrawals stay spending (category "Cash withdrawals") and Fuliza fees stay on M-PESA. New SMS follow
   D-009 (withdrawal = transfer to cash, Fuliza fee on the Fuliza account).
3. **Categories keep their old names**; "uncategorised" rows have none and, with "(check)" rows and foreign-
   currency estimates, go to review.
4. **No names in the code.** Accounts and loans are derived from the ledger's own text (account column,
   "Loan - X" categories), so lenders, Saccos and card providers are not named in this public repo.
5. **Re-runs are safe.** Each row's dedupe key is a hash of its contents plus how many identical rows came
   before it, so editing nothing and running again inserts nothing.

**Why:** Totals must match what the owner already trusts. Checked on the dev project: row counts and income,
expense, borrowing, debt repaid and saving per year match `ledgers/SUMMARY.md` for 2020–2025 to the
shilling; 2026 matches the CSV (the summary predates two repayments added on 2026-10-24).
**Consequence:** Historic balances do not reconcile until opening balances are set; the owner enters those.

