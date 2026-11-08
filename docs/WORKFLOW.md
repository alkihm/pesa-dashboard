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
2. Run the progress check (path in `SERVER.md`, `progress/check.sh`) — what the other laptop is doing,
   notes addressed to you, open pull requests, claimed issues. Act on any note for you first.
3. `git switch dev && git pull --rebase`
4. Read [STATUS.md](STATUS.md) — the current state and what is next.
5. If you have an open branch, rebase it: `git switch <branch> && git pull --rebase origin dev`.
6. Otherwise pick the next issue:
   - in the current milestone, `P0` before `P1`;
   - not labelled for the other laptop;
   - everything under **Depends on** is closed;
   - prefer a different `epic:*` from what the other laptop is doing.
7. Label it `laptop:A` or `laptop:B`, comment `Started on <laptop>`, move its card to **In progress** on the
   [project board](https://github.com/users/alkihm/projects/2), then `git switch -c feat/<issue-number>-<slug>`.
   Label an issue only when you start it, not when it is assigned in a split: the board reads the label plus the
   "Started on" comment as "In progress".
8. Update your live board (`progress/<laptop>.md`, "Now" table): issue, branch, state, files you will touch.

## Keeping each other informed

Two places, used together:

| Where | Who writes | What |
|---|---|---|
| `progress/hydracore.md`, `progress/alfie.md` on the server | each laptop only its own file | "Now" table (issue, branch, state, files being touched, blockers, time) and a dated log, newest on top |
| `progress/NOTES.md` on the server | both, add-only | Messages that affect the other laptop: schema changed, shared file edited, decision taken, please avoid X, questions. Reply with a new line once acted on. |
| GitHub | both | Labels, draft PRs and issue comments — the permanent record |
| [Project board](https://github.com/users/alkihm/projects/2) | both, your own cards | Where each issue stands at a glance, for the owner too. Move your card to **In progress** when you start and **In review** when its PR is open. New issues are added automatically, and a card moves to **Done** when its issue closes. New work that fits an epic becomes a sub-issue of that `[EPIC n]` issue. |

Update your board at the start, when you open or finish a pull request, when you get blocked, and at the end.
Write a note **before** you change something the other laptop depends on (tokens, app shell, router, schema,
shared types). These files are on the server only — never copy them into the repo.

**Talk session to session when both are active.** Claude sessions on the same machine can message each other
directly (Claude Code lists other local sessions; send with SendMessage). Use it for quick questions that would
otherwise wait for the next session: "I am about to touch `X`, are you in it?", "is your PR ready to go first?".
Anything that changes what the other laptop does still goes into `progress/NOTES.md` as well; the notes and the
boards stay the written record.

## While working

- Commit small: `type(scope): summary (#issue)`.
- Push the branch at least once per session and open a **draft** pull request early so the other laptop can
  see it.
- Test on the lowest rung first: `pnpm check:changed` → your dev server (laptop browser, then the iPhone over the
  home network or Tailscale). The full suite runs in CI (next section).
- Shared files (design tokens, app shell, router, database schema) change in small pull requests that are
  merged quickly. The `overlap` job comments on a pull request when another open pull request changes the same
  files, and lists the shared files it touches.
- **Building a screen ([5.0]):** register it in your feature's own `src/features/<feature>/routes.tsx`
  (`export const routes: FeatureRoutes = { shell: [...] }`; `signedIn: [...]` for a signed-in page outside the
  shell, like `/report`). `src/app/routes.tsx` picks every such file up by itself — do not edit it to add a
  screen. The "no two routes with the same path" test in `src/app/App.test.tsx` covers the collected list.

## Tests and CI (D-018)

Both workspaces run on one server, so every test a laptop runs costs the other laptop too. The full suite runs
**once, in CI**; laptops check only what they changed.

| Where | What runs |
|---|---|
| Your workspace | `pnpm check:changed`: Prettier and ESLint on changed files, the hex-colour check, typecheck, and the Vitest tests whose imports reach a changed file (`vitest --changed origin/dev`, one worker) |
| CI `checks` job | Prettier, ESLint, typecheck, the whole Vitest suite, production build |
| CI `e2e` job | A fresh local Supabase (every migration and the seed applied from scratch), `supabase test db` (pgTAP), then the Playwright suite in `e2e/` against a production build, at phone width in light mode and desktop width in dark mode |
| CI `overlap` job | Comment on the PR naming files that other open PRs also change, and the shared files it touches. Informational only |

- **Every PR is tested on top of the latest `dev`.** `dev` requires branches to be up to date, so a PR that falls
  behind must be updated before it can merge, and CI runs again on the combined code. Update with
  `gh pr update-branch <n>` (adds a merge commit to your branch; the squash merge flattens it, so no force-push).
- **Screenshots come from CI.** The `e2e` artifact (`e2e-report`, linked from the run summary) holds a screenshot of
  every main screen in both layouts, the month report as a PDF, and traces for any failure. Look there instead of
  writing a one-off script. A check you would repeat belongs in `e2e/` as a test.
- **Running e2e yourself** is optional. Build with the local stack's values, serve it on your own port (Hydracore
  4183, Alfie 4184, see `SERVER.md`) and point the suite at it:
  ```
  eval "$(supabase status -o env | sed 's/^/export /')"
  export SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
  VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_ANON_KEY=$ANON_KEY pnpm exec vite build --outDir /tmp/<laptop>-e2e
  pnpm exec vite preview --outDir /tmp/<laptop>-e2e --host 127.0.0.1 --port <port> &
  E2E_BASE_URL=http://127.0.0.1:<port> pnpm e2e
  ```
- **Tests that write data use a throwaway user** (`throwawayUser()` in `e2e/support.ts`): a new user that owns
  every row the test creates and is deleted afterwards, with its rows. Read-only tests may use the seed user. Do
  the same by hand: to try a write on the shared local database, sign up a throwaway account rather than adding
  rows to `sample@example.test`.

## Database rules

- One shared local database. Only **one** open pull request may contain migrations at a time; it carries the
  `db-migration` label. Check before creating a migration. (The slot protects the shared database while an
  unmerged migration is applied to it; CI separately proves every migration applies from scratch.)
- Never edit a migration that is already merged; add a new one.
- After a migration is merged: in `integration/`, `git pull` then `supabase db reset` (rebuilds the shared dev
  database with seed data). Tell the other laptop in its issue or PR.
- Seed data is invented. Real history is imported only into the production project, from `private/`.

## Finishing an issue

1. Everything in the issue's **Done when** list is ticked.
2. `pnpm check:changed` passes.
3. Pull request into `dev` with `Closes #<n>`, marked ready for review. Then arm auto-merge:
   `gh pr merge <n> --auto --squash`. GitHub squash-merges once `checks` and `e2e` are green and the branch is up
   to date. If the session is not allowed to run that command, ask the owner to click **Enable auto-merge**.
   If CI fails, fix it on the branch; auto-merge stays armed.
4. After the merge, check the issue closed and its card is in **Done**. The `Closes` line did not fire for #20 and #33;
   if it does not, close the issue by hand with a comment naming the PR.
5. The other laptop pulls `dev` before its next commit, and updates any open PR (`gh pr update-branch`).

The owner reviews releases (`dev` → `main`) and decisions (milestone splits, migrations pushed to the cloud
projects, scope), not every feature merge.

## End of a session

1. Push your branch, even if unfinished.
2. Comment on the issue: where you stopped and what is next.
3. Update your live board: "Now" table and a log line. Leave a note if the other laptop needs to know something.
4. Update [STATUS.md](STATUS.md) in your pull request when something important changed — a milestone
   moved, a decision was made, a blocker appeared.
5. New decisions go in [DECISIONS.md](DECISIONS.md); changed requirements in [REQUIREMENTS.md](REQUIREMENTS.md).

## Releases

When a milestone's issues are closed: pull request `dev` → `main` titled `Release M<n>`. Merge it with
**Create a merge commit** (not squash), so `main` and `dev` share history and the next release PR shows only what is
new. Merging deploys production on Vercel. Database migrations and Edge Functions are not part of a release; they
are pushed to the prod Supabase project as a separate step.

## If something goes wrong

- Conflict on rebase: resolve in your workspace, run the tests, continue the rebase. Never force-push `dev` or `main`.
- Shared database broken: in `integration/`, `supabase db reset`.
- Both laptops changed the same file: the second pull request rebases and resolves; talk it through in the PR.
- `e2e` fails and you cannot see why: download the `e2e-report` artifact and open the trace of the failing test
  (`pnpm exec playwright show-trace <trace.zip>`), which replays the run step by step with screenshots.
