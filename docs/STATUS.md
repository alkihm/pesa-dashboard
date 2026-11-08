# Status

The handover note. Read it at the start of every session; update it when something important changes.

_Last updated: 2026-11-08 by Hydracore_

## Where things stand

- **Design:** complete — every phone and desktop screen, both themes, app icon. Screen list in [DESIGN.md](DESIGN.md).
- **Dev flow (D-018, #131):** the full suite, database tests and the Playwright suite (`e2e/`) run once, in CI
  (jobs `checks`, `e2e`, `overlap`); laptops run `pnpm check:changed`. Screenshots of every main screen are in each
  run's `e2e-report` artifact. Feature PRs merge by auto-merge; per-feature route files come at M5 start.
- **Repo:** public, `dev`/`main` protected (required check `checks`), 50 issues across M0–M5, plus 13 `[EPIC n]`
  parent issues (#105–#117, one per `epic:*` label) with those issues as sub-issues.
- **Project board:** [pesa-dash workspace](https://github.com/users/alkihm/projects/2), copied from the broll board
  (Backlog / Ready / In progress / In review / Done, Priority, Estimate, the same tabs). Every issue and PR is on it;
  epics show progress bars. Keep your cards moving as in WORKFLOW.md.
- **Releases:** **M0 released to `main`** on 2026-11-01 (#75) — production is live with the app shell and
  placeholder screens. Release PRs `dev` → `main` merge with **Create a merge commit**; feature PRs into `dev` squash.
- **Build:**
  - **M0 Foundation — done (9/9).** Scaffold, CI, Supabase setup, Vercel hosting, design tokens and category palette,
    app shell with every route, shared components and charts, PWA (installs, opens offline, reopens on the last
    screen), data model.
  - **M1 Data & intake — done (9/9).** Schema, row-level security, SMS parser, intake function, Shortcut, balance
    snapshots, payee rules, history import (D-012) and nightly Sheet backup (D-013).
  - **M2 Core screens — done (9/9).** Sign-in with Google and PIN, offline PIN (D-014); Overview and Home;
    Accounts, savings and debt; Month; Activity; transaction detail (`/activity/:id`); add transaction; categories;
    new account.
  - **M3 Money logic — done (7/7).** Bills with due-date colours ([3.1], `/bills`, Add bill `/bills/new`); bills
    marked paid from SMS ([3.2], D-015); Pay / Skip / Undo ([3.3]); budget items with approval ([3.4],
    `/bills/budget/new`); loan repayment slider and the Bills card on Overview ([3.5]); category budgets in Month
    ([3.6]); net position plus the after-all-debt figure ([3.7]).
  - **M4 Review & reliability — 8/10.** Hydracore's six are done: Reconcile ([4.1], `/review`); Fix a mismatch
    ([4.2]); Review status green/amber/red with Mark reviewed, history and a dot in every header ([4.3]); Month report
    that prints on one A4 page ([4.8], `/report?m=2026-10`); Export everything as CSV ([4.10], `/export`); Bulk import
    from an Excel or CSV template ([4.7], `/import`). Alfie's done: Offline queue ([4.5]), Instant refresh and
    realtime ([4.6]), Settings part A ([4.9]). Left (Alfie): [4.9] part B (currency, budget month start — a
    migration that also touches the report and `export/tables.ts`), then [4.4] Notifications.
  - **M5 Launch — not split yet.** The owner waits until Alfie finishes M4, then decides the split (2026-11-08).
- **Latest migrations:** `20261105000000_bill_loan_link`, `20261108000000_account_balances_at` (read-only function
  for month-end balances, [4.8]) and `20261108010000_realtime_publication` ([4.6]) — all on the shared local database
  **and** the dev cloud project. Not on prod (see Supabase below).
- **Intake live on the dev cloud project:** the iPhone Shortcut posts to it alongside the Sheet ([1.6], steps in
  [SHORTCUT.md](SHORTCUT.md)).
- **Dev cloud data:** the old ledgers (2020–2026) are imported — about 20,600 transactions, 3,823 flagged for review.
  No opening balances yet, so historic balances do not reconcile until the owner enters them. **Owner: test on dev
  only for now — do not import into production** until they say so.
- **Sheet backup live on dev:** pg_cron runs `sheet-backup` at 23:30 Nairobi time into the "Pesa Dashboard backup"
  Sheet; each run is logged in `backup_runs` (for Settings). Secrets in `private/env/` on the server.
- **Toolchain:** Node **24** LTS (`.nvmrc`, `engines: 24.x`, #74), pnpm 9.15.0, GitHub CLI,
  Supabase CLI 2.20.5 on the server. After pulling #74, run `nvm use && pnpm install` once in a workspace.
- **Supabase:** cloud projects `pesa-dashboard-dev` and `pesa-dashboard-prod` (Frankfurt); refs and keys in
  `private/env/` on the server. Local stack runs on the server without Studio, analytics, Inbucket and storage.
  **The prod project has not had the migrations or the intake function deployed** — that is a deliberate step
  before production reads data.
- **Data model:** settled in [0.9] — tables in [ARCHITECTURE.md](ARCHITECTURE.md), reasons in D-009; D-010 made savings
  count in net position.

## Where to look

| What | Where | Notes |
|---|---|---|
| Latest `dev` on the phone (owner) | https://pesa-dashboard-git-dev-autotechfy.vercel.app | Vercel's `dev` branch build, private (Vercel sign-in). Uses the dev Supabase project. **Use this one**: production is still M0, so it shows placeholder screens. |
| Latest `dev` (server) | https://pesa-dev.autotechfy.com | Server preview, rebuilds itself within ~5 min of a merge (SERVER.md). Blank since [2.1]: `integration/` has no `.env.local`, and the owner chose to leave it. |
| Project board | https://github.com/users/alkihm/projects/2 | Where every issue and PR stands. |
| A pull request | Vercel preview link posted on the PR | Private (Vercel sign-in). Uses the dev Supabase project. |
| Production (`main`) | Vercel production domain (`pesa-dashboard-livid.vercel.app`) | Public. Uses the prod Supabase project. |
| Every shared component | `/dev/components` on a workspace dev server | Dev server only; not in builds. |

Install on the iPhone from the dev preview above in Safari (Share → Add to Home Screen). Theme: Settings → Appearance
(Light / Dark / System). After an update, close and reopen the installed app (twice if needed).

## First time on Alfie

1. Create an SSH key on Alfie and add its public key to `~/.ssh/authorized_keys` on the server; add a
   `nascore` entry to Alfie's `~/.ssh/config` (host and user are in `SERVER.md`, readable from Hydracore).
2. VS Code → install "Remote - SSH" → "Remote-SSH: Connect to Host… → nascore" → open
   `/srv/Kihmnas/pesa-dashboard/ws-alfie`.
3. Open Claude Code there and say "start the session". It reads `CLAUDE.md`, then this file and
   [WORKFLOW.md](WORKFLOW.md), and picks up Alfie's next issue below.
4. Claude on Alfie has no memory of the design conversation — everything it needs is in `docs/`.
   The design canvas link is owner-only; open it from the claude.ai account if a screen needs checking.

## Next

| Laptop | Next issues |
|---|---|
| Hydracore | M4 done. Waiting for the M5 split (owner decides after Alfie's M4). |
| Alfie | M4: [4.9] part B (#43, db-migration) → [4.4] Notifications (#38) |

The M4 split was confirmed by the owner on 2026-11-04 and re-split on 2026-11-08 (Hydracore took [4.7] and [4.10]).
M5 candidates: [5.1] Device testing, [5.2] Accessibility pass, [5.3] Cut-over, [5.4] Backups and restore drill,
[5.5] Monitoring (needs [4.4] push), [5.6] Retire Apps Script.

**Server note:** Node on nascore segfaults now and then (exit 139) in `tsc`, Prettier and Vitest, even when the
server is idle; a rerun passes and CI is unaffected. Run `pnpm test --maxWorkers=1` and rerun once before suspecting
code. Owner to check the server's memory or the Node build.

Shared pieces from M4 (Hydracore):
- **Reconcile ([4.1]):** `reconcileRow(account)` in `src/features/review/reconcile.ts` gives each account's state
  (`match` / `mismatch` / `manual` / `no_sms`), its pill, detail line and explanation; `banner(rows)` gives the
  "Needs reconciling" text. [4.4] notifications can reuse the same wording. `difference_cents` = reading − ledger
  **at the reading's time**, so any fix must be dated at or before the SMS or count.
- **Fix a mismatch ([4.2], PR #102):** `missingTransactionLink(account)` and `saveAdjustment()` in
  `src/features/review/fix.ts`. An `adjustment` needs a reason (the schema refuses one without) and is dated at the
  reading's time. Add transaction can start filled in from a link: `formFromParams()` in
  `src/features/transactions/form.ts` reads `?direction&account&amount&date&at`, and `?back=` sets the header's back
  link (in-app paths only).
- **Review status ([4.3]):** rules in `src/lib/review.ts` (`reviewStatus()`, `reviewHistory()`, `reviewBands()`):
  green inside `settings.review_interval_days`, amber after, red after twice the interval plus one day or on any
  mismatch. `ReviewStatusProvider` (AppShell) feeds the dot in `PageHeader`; call `useReviewStatus()?.refresh()`
  after anything that changes it. Mark reviewed writes `reviews` + `review_checks`. [4.4] can reuse the wording.
- **Month report ([4.8]):** `buildReport()` in `src/features/report/report.ts` reuses the Month sums;
  `account_balances_at(p_at)` gives each account's ledger at a moment (month end = `monthEnd(month)`). `/report` is
  outside AppShell (own `RequireSession`) so print has no tab bar; Download PDF is the browser's print dialog.
- **Export everything ([4.10]):** `src/features/export/tables.ts` lists every exported table and column, **type-checked
  against `database.types.ts`** — a new column fails `pnpm typecheck` until it is listed there. `readExport()` reads a
  zip back. CSV rule: empty unquoted = null, `""` = empty text (as Postgres `COPY … CSV`). `zip.ts` writes stored
  ZIPs and reads stored or deflated ones (no dependency).
- **Bulk import ([4.7]):** `parseSheet()` (`src/features/import/rows.ts`) maps sheet rows with per-row errors;
  `classify()` (`dedupe.ts`) applies the duplicate rules (ref in file, ref in ledger, imported before, same amount
  same day); `saveImport()` writes one `import_batches` row and `source = 'import'` transactions with dedupe keys,
  then `announce(["transactions"])`. `xlsx.ts` reads and writes the workbook.
- **Routes:** App.test fails if two routes share a path (#128) — two PRs adding the same route merge without a git
  conflict, and the router silently uses the first.

Shared pieces from M3 to build on:
- **Bills:** status rules in `src/features/bills/status.ts` on top of `src/lib/due.ts`; `useBills(db, month)` runs
  `ensure_bill_months` and also returns earlier unpaid months. SMS matching rules are D-015.
- **Actions ready for the offline queue ([4.5]):** Pay / Skip / Undo (`sendBillAction`, `src/features/bills/actions.ts`)
  and Approve / Cancel (`sendBudgetAction`, `src/features/bills/budget.ts`) are single updates sent with the row
  `version`; a row changed elsewhere is refused and reloaded. The queue only has to route these calls.
- **Budget items:** `setAsideCents(items)` is the approved-but-unspent amount (only on the Bills screen today).
- **Loans:** `allocate()` and `incomeBase()` in `src/features/loans/allocation.ts`; the share is
  `settings.loan_allocation_pct`; instalments are bills with `loan_account_id`.
- **Category budgets:** 90% amber / over red in `src/lib/budget.ts` (Hydracore).

Shared pieces from M2 to build on:
- **Supabase:** one client, `src/lib/supabase.ts`. Every screen sits behind the session and PIN gate ([2.1]).
- **Data hooks** in `src/lib/data/`: `useCategories` (Alfie), `useAccounts` (Hydracore). `.gitignore` has a
  `!src/lib/data/` exception because the `data/` rule for real ledgers matched it.
- **Transactions:** `activityQuery` (optional `range`) in `src/features/activity/query.ts`. `TransactionTable` and
  `TransactionList` are reusable, read-only without their editing props. A row opens at `/activity/:id`.
- **New account card:** `NewAccountCard` from `src/features/accounts/new/NewAccountScreen.tsx`, for the Accounts page.
- **Saving several rows at once:** pass `{ defaultToNull: false }` to `insert`, or fields some rows leave out become
  null (`needs_review` is not null). Transfer legs must be inserted together, because the database refuses a lone leg.
- **Tests:** vitest sets a dummy Supabase env (vite.config.ts), so tests never read a workspace's `.env.local`.

Building a screen: replace its `Placeholder` in `src/app/routes.tsx` with a screen from `src/features/<feature>/`,
render `PageHeader` at the top, build from `src/components/` (see CLAUDE.md), format money with `src/lib/money.ts`.
Accounts receive SMS through `sms_account_hint` (ARCHITECTURE: accounts). Real data goes only to the cloud projects,
never to the repo or the local database.

## Open questions

- The local Supabase database (port 54322, password `postgres`) and API (54321) listen on all interfaces —
  the CLI has no bind setting. The API must stay reachable for phone testing; the database port should be
  firewalled to localhost on the server (owner).
- Production deploy of the database: when and how migrations, the intake and sheet-backup functions and the
  history import reach the prod project (before [2.1]/[2.2] read real data).

## Owner to-dos outside the repo

- **Cloudflare Access on pesa-dev.autotechfy.com** (Zero Trust → Access → Applications, own Google account only,
  ~1 month session) — before screens show data.
- **Vercel:** check Settings → Build and Deployment → Node.js Version is 24.x.
- **iPhone:** confirm Settings → Appearance → Light works in the installed app.
- Rename the M-PESA statement in `Budget_tracker/statements/` — its file name contains the password.
- `ledger-postgres` (from `finance-tracker-local`) is exposed on all interfaces on port 5432; bind it to
  `127.0.0.1` or stop it if that project is retired.
