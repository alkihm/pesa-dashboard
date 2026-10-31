# Notes for Claude

## Project

Personal budget dashboard. SMS → Shortcut → Supabase intake → Postgres → installable React app.
Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESIGN.md](docs/DESIGN.md) before a first change.

## At the start of every session

1. Work out which laptop you are on (`hostname` on the laptop, or the workspace folder name on the server):
   Hydracore → `ws-hydracore`, label `laptop:A`; Alfie → `ws-alfie`, label `laptop:B`.
2. Run the progress check on the server (`progress/check.sh`, path in `SERVER.md`; over non-interactive ssh
   prefix `source ~/.nvm/nvm.sh &&`). Act on notes addressed to you in `progress/NOTES.md` first.
3. Follow [docs/WORKFLOW.md](docs/WORKFLOW.md) "Start of a session" — pull `dev`, read [docs/STATUS.md](docs/STATUS.md),
   pick or resume an issue, and update your own `progress/<laptop>.md` board.
4. Requirements live in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), decisions in [docs/DECISIONS.md](docs/DECISIONS.md).
   Do not re-open a recorded decision without the owner.
5. Never edit the other laptop's workspace, its progress board, or `integration/`. Host details are in `SERVER.md` on the server.
6. Before changing something the other laptop depends on (tokens, app shell, router, schema, shared types), add a
   line to `progress/NOTES.md`.
7. Before ending: push the branch, comment on the issue where you stopped, update your progress board, and update
   STATUS.md if anything important changed.

## Rules

- The repo is public. Never read real data into code, fixtures, docs or commit messages. Never copy
  anything from `X:\Budget_tracker` (ledgers, SMS exports, statements, payslips) or any Sheet ID, key or PIN.
  Fixtures use invented names, numbers and reference codes.
- Work on one issue per branch, off `dev`, named `feat/<issue>-<slug>`. Never commit to `main` or `dev` directly.
- Commit messages: `type(scope): summary (#issue)`.
- Money is stored as integer cents (`bigint`), never floats. Display with the KES formatter.
- Dates are stored in UTC and shown in `Africa/Nairobi`.
- Every screen supports light and dark mode and works from 360px to desktop widths.
- Colours, fonts, radii and shadows come from the design tokens — no hard-coded hex values in components.
- Money logic (net position, loan allocation, bill status, reconciliation) gets unit tests with Vitest.
- Keep the raw SMS text on every transaction that came from one; the review screens show it.

## Commands

Node 22 (`.nvmrc`) and pnpm 9. On the server, run `source ~/.nvm/nvm.sh` first in non-interactive shells.

| Command | Does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev --host --port <port>` | Dev server — port per laptop in `SERVER.md` |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm test` | Vitest once (`pnpm test:watch` to watch) |
| `pnpm build` | Type check and production build into `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm format` / `pnpm format:check` | Prettier (Markdown is formatted by hand) |
| `supabase status` | Local stack URLs and keys (the stack is shared, project id `pesa-dashboard`) |
| `supabase migration new <name>` | New migration in `supabase/migrations/` — only in the one PR labelled `db-migration` |
| `supabase db reset` | Rebuild the shared local database — run in `integration/` only |
| `supabase gen types typescript --local > src/lib/database.types.ts` | Regenerate the database types after a migration, then `pnpm format` |

Config comes from env only: copy `.env.example` to `.env.local` and fill it from `supabase status`.
`src/lib/env.ts` fails at start-up if a value is missing.

Source layout: `src/app` (entry, shell, routes), `src/features/<feature>` (screens and their logic),
`src/components` (shared UI), `src/lib` (shared helpers). Import from `src` with the `@/` alias.

Screens are built from `src/components` (Card, KpiCard, Chip, Segmented, Switch, StatusPill, EmojiTile,
fields, Button, ViewAllLink, Donut, BarChart) — open `/dev/components` on the dev server to see them all.
Format money with `src/lib/money.ts` (`formatKes`, `formatAmount`, `formatCompact`).
