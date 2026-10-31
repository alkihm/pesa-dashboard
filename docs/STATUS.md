# Status

The handover note. Read it at the start of every session; update it when something important changes.

_Last updated: 2026-10-31 by Hydracore_

## Where things stand

- **Design:** complete — every phone and desktop screen, both themes, app icon. Screen list in [DESIGN.md](DESIGN.md).
- **Repo:** public, `dev`/`main` protected, 50 issues across M0–M5, labels and milestones in place.
- **Server:** project folder laid out with `integration/`, `ws-hydracore/`, `ws-alfie/` and `private/`, and
  excluded from Syncthing on the server and on Hydracore. Toolchain installed (Node 22.23.4 via nvm,
  pnpm 9.15.0, GitHub CLI, Supabase CLI 2.20.5); GitHub login done, all three clones can push.
  Details and ports in `SERVER.md` on the server.
- **Build:** not started. Hydracore begins with [0.1].

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
| Alfie | [0.9] data-model decision (#9) → [0.3] Supabase local stack (#3) → [1.4] SMS parser (#13) |

[0.1] goes first — Alfie starts [0.9], which is writing, while it is in progress.

## Open questions

- Vercel or Cloudflare Pages — decide in [0.4].
- The server has about 4 GB of free memory; the local Supabase stack should run without Studio and
  analytics if memory gets tight — check in [0.3].

## Owner to-dos outside the repo

- Rename the M-PESA statement in `Budget_tracker/statements/` — its file name contains the password.
- `ledger-postgres` (from `finance-tracker-local`) is exposed on all interfaces on port 5432; bind it to
  `127.0.0.1` or stop it if that project is retired.
