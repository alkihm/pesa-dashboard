# Workflow — two laptops, one server

Rules for working on this project from **Hydracore** (laptop A) and **Alfie** (laptop B). A person or Claude
starting a session on either laptop follows this file top to bottom.

Host names, IP addresses, ports and paths are kept in `SERVER.md` on the server, next to the
workspaces — not in this public repo.

## The setup

```
                GitHub (alkihm/pesa-dashboard) — the only way code moves
                  ▲ push / pull          ▲ push / pull          │ pull dev
                  │                      │                      ▼
Home server  ws-hydracore/           ws-alfie/             integration/
             (Hydracore's clone)     (Alfie's clone)       (always on dev: preview + migrations)
                  │                      │                      │
                  └──── one shared local Supabase (Docker): dev database, auth, functions ────┘
                  ▲                      ▲
           VS Code Remote-SSH     VS Code Remote-SSH
              Hydracore                Alfie
```

- Each laptop opens **only its own workspace** over Remote-SSH: Hydracore → `ws-hydracore`, Alfie → `ws-alfie`.
- `integration/` is never edited by hand. It follows `dev`, runs the shared preview, and is where merged
  migrations are applied to the shared database.
- Secrets live in `private/` on the server (owner-only permissions), never in a workspace or in git.
- The project folder is excluded from Syncthing.

## Which machine am I?

| Hostname | Laptop | Label | Workspace | Dev server port |
|---|---|---|---|---|
| Hydracore | A | `laptop:A` | `ws-hydracore` | see SERVER.md |
| Alfie | B | `laptop:B` | `ws-alfie` | see SERVER.md |

Each workspace commits as `Alkihm (Hydracore)` or `Alkihm (Alfie)`, so history shows which laptop did what.

## Start of a session

1. Open your own workspace over Remote-SSH.
2. `git switch dev && git pull --rebase`
3. Read [STATUS.md](STATUS.md) — the current state and what is next.
4. If you have an open branch, rebase it: `git switch <branch> && git pull --rebase origin dev`.
5. Otherwise pick the next issue:
   - in the current milestone, `P0` before `P1`;
   - not labelled for the other laptop;
   - everything under **Depends on** is closed;
   - prefer a different `epic:*` from what the other laptop is doing.
6. Label it `laptop:A` or `laptop:B`, comment `Started on <laptop>`, then
   `git switch -c feat/<issue-number>-<slug>`.

## While working

- Commit small: `type(scope): summary (#issue)`.
- Push the branch at least once per session and open a **draft** pull request early so the other laptop can
  see it.
- Test on the lowest rung first: `pnpm test` → your dev server (laptop browser, then the iPhone over the home
  network or Tailscale).
- Shared files (design tokens, app shell, router, database schema) change in small pull requests that are
  merged quickly.

## Database rules

- One shared local database. Only **one** open pull request may contain migrations at a time — it carries the
  `db-migration` label. Check before creating a migration.
- Never edit a migration that is already merged; add a new one.
- After a migration is merged: in `integration/`, `git pull` then `supabase db reset` (rebuilds the shared dev
  database with seed data). Tell the other laptop in its issue or PR.
- Seed data is invented. Real history is imported only into the production project, from `private/`.

## Finishing an issue

1. Everything in the issue's **Done when** list is ticked.
2. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.
3. Pull request into `dev` with `Closes #<n>`, ready for review; CI green; squash-merge.
4. The other laptop pulls `dev` before its next commit.

## End of a session

1. Push your branch, even if unfinished.
2. Comment on the issue: where you stopped and what is next.
3. Update [STATUS.md](STATUS.md) in your pull request when something important changed — a milestone
   moved, a decision was made, a blocker appeared.
4. New decisions go in [DECISIONS.md](DECISIONS.md); changed requirements in [REQUIREMENTS.md](REQUIREMENTS.md).

## Releases

When a milestone's issues are closed: pull request `dev` → `main` titled `Release M<n>`. Merging deploys
production.

## If something goes wrong

- Conflict on rebase: resolve in your workspace, run the tests, continue the rebase. Never force-push `dev` or `main`.
- Shared database broken: in `integration/`, `supabase db reset`.
- Both laptops changed the same file: the second pull request rebases and resolves; talk it through in the PR.
