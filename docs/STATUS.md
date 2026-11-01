# Status

The handover note. Read it at the start of every session; update it when something important changes.

_Last updated: 2026-11-01 by Alfie_

## Where things stand

- **Design:** complete — every phone and desktop screen, both themes, app icon. Screen list in [DESIGN.md](DESIGN.md).
- **Repo:** public, `dev`/`main` protected (required check `checks`), 50 issues across M0–M5.
- **Releases:** **M0 released to `main`** on 2026-11-01 (#75) — production is live with the app shell and
  placeholder screens. Release PRs `dev` → `main` merge with **Create a merge commit**; feature PRs into `dev` squash.
- **Build:**
  - **M0 Foundation — done (9/9).** Scaffold, CI, Supabase setup, Vercel hosting, design tokens and category palette,
    app shell with every route, shared components and charts, PWA (installs, opens offline, reopens on the last
    screen), data model.
  - **M1 Data & intake — done (9/9).** Schema, row-level security, SMS parser, intake function, Shortcut, balance
    snapshots, payee rules, history import (D-012) and nightly Sheet backup (D-013).
  - **M2 Core screens — not started.**
- **Intake live on the dev cloud project:** the iPhone Shortcut posts to it alongside the Sheet ([1.6], steps in
  [SHORTCUT.md](SHORTCUT.md)).
- **Dev cloud data:** the old ledgers (2020–2026) are imported — about 20,600 transactions, 3,823 flagged for review.
  No opening balances yet, so historic balances do not reconcile until the owner enters them. Production gets the
  same import once the owner has checked dev.
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
| Latest `dev` (both laptops' merged work) | https://pesa-dev.autotechfy.com | Server preview, rebuilds itself within ~5 min of a merge (SERVER.md). Public until Cloudflare Access is added. |
| A pull request | Vercel preview link posted on the PR | Private (Vercel sign-in). Uses the dev Supabase project. |
| Production (`main`) | Vercel production domain (`pesa-dashboard-livid.vercel.app`) | Public. Uses the prod Supabase project. |
| Every shared component | `/dev/components` on a workspace dev server | Dev server only; not in builds. |

Install on the iPhone from pesa-dev in Safari (Share → Add to Home Screen). Theme: Settings → Appearance
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
| Hydracore | M2: [2.1] sign-in, Google + PIN (#19) → [2.2] Overview and Home (#20) → [2.4] Month (#22) → [2.8] Categories (#26) |
| Alfie | M2: [2.5] Activity (#23) → [2.6] Transaction detail (#24) → [2.7] Add transaction (#25) — after [2.1] lands the Supabase client and session |

The M2 split is a proposal — confirm or swap at the start of the next session. [2.3] Accounts (#21) and
[2.9] New account (#27) go to whichever laptop frees up first.

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
