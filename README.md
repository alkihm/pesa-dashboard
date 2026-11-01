# Pesa Dashboard

A personal budget dashboard that fills itself in. Every M-PESA, bank and loan SMS on the iPhone is
captured by a Shortcut, parsed into a ledger, and shown as a clean dashboard on the phone and the
laptop: balances, debt, savings, bills, where the money went, and whether everything reconciles.

## How it works

```
iPhone SMS ──► Shortcut ──► intake function (secret key) ──► Postgres (Supabase)
                                                              │
                     Google Sheet (nightly backup copy) ◄─────┤
                                                              ▼
              Installable web app on phone, laptop and tablet (offline queue, PIN, Google sign-in)
```

| Part | Choice | Why |
|---|---|---|
| App | React + TypeScript + Vite, installable (PWA) | One codebase for every device; works offline; home-screen install and push on iOS |
| Data | Supabase Postgres with row-level security | Fast queries, keeps the raw SMS behind every transaction, owner-only access |
| Intake | Supabase Edge Function | The Shortcut posts each SMS; parsing and de-duplication happen server-side |
| Auth | Google sign-in + app PIN | PIN for quick unlock; reset through the Google account |
| Backup | Nightly copy to Google Sheets | The familiar Sheet stays as a read-only mirror |
| Hosting | Vercel or Cloudflare Pages | Free, preview link per pull request |

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESIGN.md](docs/DESIGN.md).

## Status

Design is complete. The build is tracked as GitHub issues in six milestones:

| Milestone | Scope |
|---|---|
| M0 Foundation | Tooling, CI, Supabase, design tokens, app shell |
| M1 Data & intake | Schema, history import, SMS parser and intake, Shortcut, Sheet backup |
| M2 Core screens | Sign-in and PIN, overview, accounts, month, activity |
| M3 Money tools | Bills, budget approvals, loan split, savings, debt, categories |
| M4 Review & reliability | Reconcile, review status, notifications, offline, import, report |
| M5 Launch | Phone testing, cut-over from the Sheet, backups, monitoring |

## Privacy

This repository is public and holds **code only**. Real transactions, SMS exports, statements,
Sheet IDs, PINs and keys never go in it — see [CONTRIBUTING.md](CONTRIBUTING.md#never-commit).
Tests use made-up fixtures.

## Working on it

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, pull requests and the two-laptop routine.

### Setup

Needs Node 24 (see `.nvmrc`) and pnpm 9.

```sh
nvm use
corepack enable   # or install pnpm 9 another way
pnpm install
pnpm dev
```

| Command | Does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm lint` | Lint with ESLint |
| `pnpm typecheck` | Type check (strict TypeScript) |
| `pnpm test` | Run the Vitest suite |
| `pnpm build` | Production build into `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm format` | Format with Prettier |
