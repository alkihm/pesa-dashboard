# Contributing

One person, two laptops. Work moves through GitHub issues, one branch per issue, merged into `dev`
by pull request. `main` is what the live app runs.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production. Changes arrive only by merging `dev` for a release. |
| `dev` | Integration and the default branch. Every pull request targets it. |
| `feat/<issue>-<slug>` | New capability, e.g. `feat/31-bills-due-colours` |
| `fix/<issue>-<slug>` | Bug fix |
| `chore/<issue>-<slug>` | Tooling, docs, housekeeping |

## The loop for one issue

1. Pick an issue in the current milestone and label it `laptop:A` or `laptop:B` so the other laptop
   leaves it alone.
2. `git switch dev && git pull --rebase`
3. `git switch -c feat/<issue>-<slug>`
4. Commit in small steps. Message format: `type(scope): summary (#issue)`, e.g.
   `feat(bills): colour bills by days to due date (#31)`.
5. `git push -u origin HEAD`, open a pull request into `dev` with `Closes #<issue>` in the body.
6. CI must pass. Squash-merge, delete the branch.
7. On the other laptop: `git switch dev && git pull --rebase` before starting anything new.

If a branch lives longer than a day, rebase it on `dev` (`git pull --rebase origin dev`) so conflicts
stay small.

## Splitting work between the laptops

- Take whole issues, never half of one.
- Prefer issues from different epics at the same time (for example `epic:intake` on one laptop,
  `epic:ui` on the other) so the two branches rarely touch the same files.
- Shared files — tokens, the app shell, the database schema — change in their own small pull requests
  and get merged quickly.

## Labels

| Label | Meaning |
|---|---|
| `epic:*` | Area of the app (foundation, data, intake, auth, ui, accounts, transactions, bills, review, offline, reports, settings, ops) |
| `P0` / `P1` / `P2` | Blocks the milestone / needed for launch / after launch |
| `type:feat` `type:chore` `type:infra` `type:spike` `type:bug` | Kind of work. A spike's output is a written decision in `docs/` |
| `laptop:A` / `laptop:B` | Which laptop is working on it |
| `blocked` | Waiting on something outside the repo |

Issue titles are numbered `[milestone.n]`, e.g. `[3.1]`.

## Done means

- Matches the screen named in the issue (see [docs/DESIGN.md](docs/DESIGN.md)), in light and dark mode,
  at phone width and desktop width.
- Money calculations have unit tests.
- Lint, type check, tests and build pass in CI.
- No real data in the diff.

## Never commit

This repository is **public**. None of these may ever be committed, even temporarily — git history keeps
them after deletion:

- Ledgers, SMS exports, M-PESA or bank statements, payslips, any CSV/PDF/XLSX of real money
- Google Sheet IDs, Supabase keys, the Shortcut intake key, PINs, `.env` files
- Real names, phone numbers or account numbers in test fixtures — invent them

Secrets live in `.env.local` (ignored), the Supabase dashboard and GitHub Actions secrets.
`.env.example` lists the names with empty values.
