# Backups and restore ([5.4])

Two independent copies of the data, so losing one never loses the ledger:

| Copy | What | When | Where |
|---|---|---|---|
| **Database backup** (this page) | Every public table plus `auth.users` / `auth.identities`, as a `pg_dump` custom-format file, with a `.checks` file beside it | Nightly at 02:00 Nairobi (server timer) | `private/backups/<env>/` on the server (mode 700), newest 14 kept |
| Sheet mirror ([1.9], D-013) | Readable copy of the main tables | Nightly at 23:30 (pg_cron `sheet-backup`) | "Pesa Dashboard backup" Google Sheet |

The database backup is the one a restore uses. The Sheet is for reading the data without the app.

## What a backup holds

- **Data only.** The schema is `supabase/migrations` in git; a restore applies the migrations first, then loads the
  data. A backup therefore restores into the schema of the commit you restore with: restore with the checkout that
  matches the project (normally `dev`, or `main` for prod).
- **Not kept:** auth sessions, refresh tokens, MFA factors, `auth.audit_log_entries`. After a restore the owner signs
  in again (Google, then the PIN).
- **`.checks`** (from `ops/backup-checks.sql`): the row count and an md5 of the full contents of every table, the
  ledger total and each account's total. The script takes them on the source before and after the dump; if anything
  was written in between it waits 60 s and tries once more, so a kept dump is always one consistent picture.

## Scripts

| Command | Does |
|---|---|
| `ops/db-backup.sh dev` | Back up the dev cloud project now. Read-only on the project. Prints size, table and transaction counts |
| `ops/db-backup.sh prod` | The same for prod (after launch) |
| `ops/restore-drill.sh dev` | Restore the newest dev backup into a throwaway local stack and compare it with its `.checks`. Exit 0 only if all match |
| `ops/restore-drill.sh dev <file.dump>` | The same for a given backup |
| `KEEP_DRILL=1 ops/restore-drill.sh dev` | Leave the drill stack running (db on port 54422) to look around |

Passwords come from `private/env/supabase-<env>.env` (`SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`) and are never
printed. Tools run in a `postgres:17-alpine` container (the cloud is Postgres 17). The drill uses its own project
name (`pesa-restore-drill`) and ports (+100), so it never touches the shared local stack or any cloud project, and
fetches a newer Supabase CLI with `npx` (the server's 2.20.5 only knows Postgres 15).

## Schedule (server)

`pesa-db-backup.timer` (system unit, runs as `kihm`) starts `pesa-db-backup.service` every night at 02:00
(± 5 min; `Persistent=true`, so a night missed while the server was off runs at boot). It runs
`integration/ops/db-backup.sh dev`, so it always uses the current `dev` scripts. Unit files are in the top-level
`ops/systemd/` folder on the server, next to the preview timers (SERVER.md).

- Log: `ops/db-backup.log` (one line per run, `db-backup: dev ok · …` or the error).
- Status: `systemctl list-timers pesa-db-backup.timer`, `systemctl status pesa-db-backup`.
- Run now: `sudo systemctl start pesa-db-backup`.

## Restore drill — 2026-11-08 (dev)

Backup `pesa-dev-20261108-0627.dump` (1.4 MB) restored into a fresh stack with all 15 migrations:
**all 57 checks matched** — 20,688 transactions, ledger total −1,021,825,073 cents, every table's row count and md5
equal. Repeat the drill after any migration that changes tables, and at least once a quarter.

## A real restore

Into a **new** Supabase project (never over a live one): the drill's steps 2–4 aimed at that project instead of the
throwaway stack.

1. Create the project, then `supabase link` and `supabase db push` from the matching checkout (schema).
2. `pg_restore --data-only --disable-triggers --single-transaction` the backup into it, using the same restore list
   as `ops/restore-drill.sh` (public table data, `auth.users`, `auth.identities`, sequences). `--disable-triggers`
   needs the `postgres` role of the cloud project.
3. Run `ops/backup-checks.sql` there and diff it with the backup's `.checks`. Every line must match.
4. Point the app and the functions at the new project (Vercel env, function secrets, Vault: as in LAUNCH.md steps
   `functions` – `vault`), then the Shortcut.
