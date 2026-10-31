# Status

The handover note. Read it at the start of every session; update it when something important changes.

_Last updated: 2026-10-31 by Alfie_

## Where things stand

- **Design:** complete — every phone and desktop screen, both themes, app icon. Screen list in [DESIGN.md](DESIGN.md).
- **Repo:** public, `dev`/`main` protected, 50 issues across M0–M5, labels and milestones in place.
- **Server:** project folder laid out with `integration/`, `ws-hydracore/`, `ws-alfie/` and `private/`, and
  excluded from Syncthing on the server and on Hydracore. Toolchain installed (Node 22.23.4 via nvm,
  pnpm 9.15.0, GitHub CLI, Supabase CLI 2.20.5); GitHub login done, all three clones can push.
  Details and ports in `SERVER.md` on the server.
- **Build:** not started. Hydracore begins with [0.1].
- **Supabase:** cloud projects `pesa-dashboard-dev` and `pesa-dashboard-prod` created (Frankfurt); refs and keys in
  `private/env/` on the server. Local stack runs on the server without Studio, analytics, Inbucket and storage
  (about 400 MB). `.env.example` lists the app's config.
- **Data model:** settled in [0.9] — tables in [ARCHITECTURE.md](ARCHITECTURE.md), reasons in D-009. Migrations follow it.

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
| Hydracore | [0.1] scaffold (#1) → [0.2] CI (#2) → [0.5] tokens (#5) → [0.6] app shell (#6) |
| Alfie | [1.4] SMS parser (#13), then the first schema migration from D-009 |

[1.4] must write overdraft (Fuliza) draws as transfers from an overdraft account — see D-009 rule 3.

## Open questions

- Vercel or Cloudflare Pages — decide in [0.4].
- The local Supabase database (port 54322, password `postgres`) and API (54321) listen on all interfaces —
  the CLI has no bind setting. The API must stay reachable for phone testing; the database port should be
  firewalled to localhost on the server (owner).

## Owner to-dos outside the repo

- Rename the M-PESA statement in `Budget_tracker/statements/` — its file name contains the password.
- `ledger-postgres` (from `finance-tracker-local`) is exposed on all interfaces on port 5432; bind it to
  `127.0.0.1` or stop it if that project is retired.
