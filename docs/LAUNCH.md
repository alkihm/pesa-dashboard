# Launch runbook ([5.7], [5.3], [5.6])

How production goes from the M0 placeholder to the full app, then how the iPhone Shortcut and the Apps Script are
switched over. Decided in D-019: sessions prepare and dry-run everything; **the owner gives one approval for the
prod push and merges the release PR**. The old ledger history is **not** imported into production as part of the
launch (owner decides later, D-012 script, dry run first).

Who does what is marked on each step: **Owner** or **Session** (a Claude Code session on the server, only after the
owner's OK in that session for anything that writes to production).

## What production needs

| Piece | Where | Set by |
|---|---|---|
| Every migration in `supabase/migrations` (schema, RLS, intake, PIN, backups, notifications, pg_cron jobs `sheet-backup` and `notify`) | prod Supabase database | `ops/launch-prod.sh` step `db` |
| System categories "Transaction fees" and "Uncategorised" for the owner (intake needs them) | `public.categories` | step `categories` |
| Edge Functions `intake`, `sheet-backup`, `notify` (all `--no-verify-jwt`: each checks its own key or the user's token) | prod Supabase | step `functions` |
| Function secrets `INTAKE_KEY`, `INTAKE_USER_ID`, `OWNER_USER_ID`, `BACKUP_KEY`, `BACKUP_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT`, `NOTIFY_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | prod Supabase → Edge Functions → Secrets | step `secrets`, from `private/env/functions-prod.env` |
| Vault `sheet_backup_url`, `sheet_backup_key`, `notify_url`, `notify_key` (the pg_cron jobs do nothing until they exist) | prod database | step `vault` |
| Vercel **Production** env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (prod project), `VITE_VAPID_PUBLIC_KEY` (from `functions-prod.env`) | Vercel → Settings → Environment Variables | Owner |
| Google sign-in for the production address | Supabase Auth + Google Cloud OAuth client | Owner |

New keys for production, never the dev ones: `ops/launch-prod.sh --prepare` writes them to
`private/env/functions-prod.env` (mode 600) on the server. Values never go into the repo, an issue or a chat.

## The script

`ops/launch-prod.sh` runs the steps in order — `preflight → db → owner → categories → secrets → functions → vault →
cron` — and stops at the first failure. Every step can be run again safely.

| Command | Does |
|---|---|
| `ops/launch-prod.sh` | **Dry run** (default). Read-only against prod: lists the migrations `supabase db push` would apply, what is already in Vault and pg_cron, which secrets are still empty. Changes nothing |
| `ops/launch-prod.sh --prepare` | Writes `private/env/functions-prod.env` with new random keys and a new VAPID pair. Touches nothing in prod |
| `OWNER_APPROVED=yes ops/launch-prod.sh --apply [--from <step>]` | Does it. Refuses without `OWNER_APPROVED=yes`, and unless the workspace sits clean at the tip of `origin/dev` or `origin/main` |

It reads `private/env/supabase-prod.env` (ref, DB password), `functions-prod.env` and `launch-prod.env`
(`OWNER_EMAIL=` the Google account the owner signs in with). SQL goes to the prod session pooler through the `psql`
inside the local Supabase container; nothing is installed.

## Before you start

- [ ] All M5 feature PRs merged into `dev`, CI green.
- [ ] Release PR **`Release M1–M5`** (`dev` → `main`) open and green. Not merged yet.
- [ ] **Session:** `ops/launch-prod.sh --prepare`, then fill `BACKUP_SHEET_ID` in `functions-prod.env` with a new
      "Pesa Dashboard backup (prod)" Sheet that the owner shared with the backup service account (Editor).
- [ ] **Owner:** write `private/env/launch-prod.env` with one line, `OWNER_EMAIL=<your Google address>`.
- [ ] **Owner:** run the dry run (`ops/launch-prod.sh` in a server terminal, or allow a session to run it), read it,
      and paste it into the release PR. It should list every migration in `supabase/migrations` and say Vault and pg_cron are empty.

## Launch, in order

**1. Owner — Google sign-in for production**
- Supabase dashboard → `pesa-dashboard-prod` → Authentication → Providers → Google: on, with the same OAuth client
  id and secret as dev (`private/env/google-auth.env`).
- Authentication → URL Configuration: Site URL `https://pesa-dashboard-livid.vercel.app`; add it to Redirect URLs.
- Google Cloud → APIs & Services → Credentials → the OAuth client: add the redirect URI
  `https://<prod ref>.supabase.co/auth/v1/callback` and the JavaScript origin
  `https://pesa-dashboard-livid.vercel.app`.
- *Rollback:* turn the provider off. Nothing else depends on it yet.

**2. Owner — Vercel Production env**
- Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` point at the **prod** project, and add
  `VITE_VAPID_PUBLIC_KEY` (the `VAPID_PUBLIC_KEY` line in `functions-prod.env`). Production scope only.
- *Rollback:* delete the variable; the app runs without push.

**3. Owner — approve, Session — database**
- Owner says in the session: "OK to push to prod". Session, from the workspace at the tip of `origin/dev`:
  `OWNER_APPROVED=yes ops/launch-prod.sh --apply`. It runs `preflight` and `db`, then stops at `owner` because the
  owner has not signed in to production yet. That stop is expected.
- *Rollback:* the migrations only add; nothing reads the database yet. To start over, Supabase dashboard → Settings →
  General → Pause or reset the prod project (the M0 placeholder in production does not use it).

**4. Owner — merge the release PR**
- Merge **`Release M1–M5`** with **Create a merge commit**. Vercel deploys `main` to production in a few minutes.
- *Rollback:* Vercel → Deployments → the previous production deployment → **Promote to Production** (instant).
  Then revert the merge commit on `main` in a PR.

**5. Owner — first sign-in**
- Open `https://pesa-dashboard-livid.vercel.app`, sign in with Google, choose a PIN. The ledger is empty.

**6. Session — the rest**
- `OWNER_APPROVED=yes ops/launch-prod.sh --apply --from owner`: finds the owner's user id, adds the two system
  categories, sets the function secrets, deploys the three functions, writes Vault, checks both pg_cron jobs.
- *Rollback:* `supabase functions delete <name> --project-ref <prod ref>` stops a function; deleting a Vault
  secret makes its pg_cron job a no-op.

**7. Owner — accounts**
- Accounts → New account for each real account, with **Match SMS automatically** on for M-PESA, Fuliza and the
  bank accounts the SMS come from. Without that, intake files each SMS under Review instead of an account.

## Smoke checklist (production, after step 7)

- [ ] Sign in with Google; close the app; open again: it asks for the PIN.
- [ ] Overview, Activity, Month, Bills, Review, Accounts, Settings open with an empty ledger and no error banner.
- [ ] Add a transaction by hand, see it in Activity and Overview.
- [ ] Shortcut test post: on the phone, run **Flush pending SMS** once with the intake action pointed at the prod URL
      and key (`intake-prod.env` is written in step 6 from `functions-prod.env`). The message shows in Activity.
- [ ] Settings → Notifications → Turn on → Send a test (Home Screen app).
- [ ] Next morning: Settings shows last night's backup run, and the prod backup Sheet has today's rows.

## Backups in production ([5.4])

The nightly database backup and the restore drill are in [BACKUPS.md](BACKUPS.md); on dev they run already. For
prod, after the smoke checklist:

- [ ] **Session:** `ops/db-backup.sh prod` once by hand. It prints `db-backup: prod ok · … · N transactions`.
- [ ] **Session:** `ops/restore-drill.sh prod`. All checks must match (with an empty ledger the counts are small but
      every table is still compared).
- [ ] **Session:** add prod to the nightly timer: in `/etc/systemd/system/pesa-db-backup.service` add a second
      `ExecStart=/srv/Kihmnas/pesa-dashboard/integration/ops/db-backup.sh prod` line (oneshot units run them in
      turn), copy it to `ops/systemd/` too, then `sudo systemctl daemon-reload`.
- [ ] Next morning: `ops/db-backup.log` has a `prod ok` line and `private/backups/prod/` has the dump and `.checks`.
- [ ] After the real history import (owner, later): run `ops/restore-drill.sh prod` again on the first backup that
      has it.

## [5.3] Cut-over — the Shortcut posts only to the app

Today the Shortcut's **Flush pending SMS** posts each SMS to the dev intake **and** to Apps Script, and reads the
Apps Script response ([SHORTCUT.md](SHORTCUT.md), "During the transition").

1. **Owner (phone):** in the intake action, change the URL and `x-intake-key` to production (from
   `private/env/intake-prod.env`; a session can show you the two values on the server).
2. Leave the Apps Script action where it is for now, so the Sheet still gets every message during the week.
3. **One clean week:** every SMS that arrives shows up in the app the same day; Review has no "no account" items
   that a better SMS match would fix; the monitoring alert ([5.5]) stays quiet. Keep a note of any miss.
4. Then follow SHORTCUT.md "After the transition": the steps after the request read the intake response, delete
   the Apps Script action. The Google Sheet stays as the nightly backup mirror.

*Rollback:* put the dev URL and key back in the intake action (the Apps Script action still holds the old path until
step 4). After step 4: re-add the Apps Script action from SHORTCUT.md.

## [5.6] Retire the Apps Script dashboard

After the cut-over week is clean:

1. **Owner:** Apps Script editor → Deploy → **Manage deployments** → archive the web-app deployment. Its URL stops
   answering.
2. Keep the script project itself (read-only) for a month, then delete it.
3. **Session:** update STATUS.md and SHORTCUT.md (no Apps Script left), close #47 and #50.

*Rollback:* Manage deployments → new deployment from the same script (a new URL; update the Shortcut if needed).
