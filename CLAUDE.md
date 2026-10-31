# Notes for Claude

## Project

Personal budget dashboard. SMS → Shortcut → Supabase intake → Postgres → installable React app.
Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESIGN.md](docs/DESIGN.md) before a first change.

## At the start of every session

1. Work out which laptop you are on (`hostname` on the laptop, or the workspace folder name on the server):
   Hydracore → `ws-hydracore`, label `laptop:A`; Alfie → `ws-alfie`, label `laptop:B`.
2. Follow [docs/WORKFLOW.md](docs/WORKFLOW.md) "Start of a session" — pull `dev`, read [docs/STATUS.md](docs/STATUS.md),
   pick or resume an issue.
3. Requirements live in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), decisions in [docs/DECISIONS.md](docs/DECISIONS.md).
   Do not re-open a recorded decision without the owner.
4. Never edit the other laptop's workspace or `integration/`. Host details are in `SERVER.md` on the server.
5. Before ending, push the branch, comment on the issue where you stopped, and update STATUS.md if anything
   important changed.

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

Filled in by issue `[0.1]`.
