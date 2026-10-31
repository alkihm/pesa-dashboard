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
