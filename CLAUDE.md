# Notes for Claude

## Project

Personal budget dashboard. SMS → Shortcut → Supabase intake → Postgres → installable React app.
Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESIGN.md](docs/DESIGN.md) before a first change.

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
