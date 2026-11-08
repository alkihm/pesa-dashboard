#!/usr/bin/env bash
# [5.4] Database backup of a Supabase cloud project, beyond the Google Sheet mirror. Runbook: docs/BACKUPS.md.
#
#   ops/db-backup.sh dev       dump the dev project   (nightly, systemd timer pesa-db-backup.timer)
#   ops/db-backup.sh prod      dump the prod project  (after launch; docs/LAUNCH.md "Backups in production")
#
# What it keeps: the DATA of every public table plus auth.users / auth.identities, as a pg_dump custom-format file.
# The schema is not in the backup on purpose: it is supabase/migrations in git, and a restore applies those first
# (ops/restore-drill.sh shows the whole path). Next to each dump, a .checks file holds row counts, an md5 of every
# table and the ledger totals, taken on the source before and after the dump; they must match, or the dump is not a
# consistent picture and the script fails. Read-only on the project. Keeps the newest $KEEP dumps (default 14).
#
# Reads the password from private/env/supabase-<env>.env (never printed). Writes to private/backups/<env>/ (mode 700).
set -euo pipefail

ENV_NAME="${1:-}"
case "$ENV_NAME" in dev | prod) ;; *) echo "usage: ops/db-backup.sh dev|prod" >&2; exit 2 ;; esac

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PRIVATE="${PRIVATE_DIR:-$REPO/../private}"
ENV_FILE="$PRIVATE/env/supabase-$ENV_NAME.env"
OUT="$PRIVATE/backups/$ENV_NAME"
KEEP="${KEEP:-14}"
POOLER="aws-1-eu-central-1.pooler.supabase.com"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}" # pg_dump must be at least the server's major version (cloud: 17)

fail() { echo "db-backup: $*" >&2; exit 1; }
val() { { grep -E "^$2=" "$1" || true; } | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

[ -f "$ENV_FILE" ] || fail "missing $ENV_FILE"
REF="$(val "$ENV_FILE" SUPABASE_PROJECT_REF)"
PASSWORD="$(val "$ENV_FILE" SUPABASE_DB_PASSWORD)"
[ -n "$REF" ] && [ -n "$PASSWORD" ] || fail "SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD not set in $ENV_FILE"

umask 077
mkdir -p "$OUT"
chmod 700 "$PRIVATE/backups" "$OUT"
STAMP="$(TZ=Africa/Nairobi date +%Y%m%d-%H%M)"
BASE="pesa-$ENV_NAME-$STAMP"

# Every tool runs in a throwaway container as this user, so the files it writes are ours and private.
pg() {
  docker run --rm -i --user "$(id -u):$(id -g)" -e PGPASSWORD="$PASSWORD" -e PGCONNECT_TIMEOUT=20 \
    -v "$OUT:/out" -v "$REPO/ops:/ops:ro" "$PG_IMAGE" "$@"
}
conn=(-h "$POOLER" -p 5432 -U "postgres.$REF" -d postgres)
checks() { pg psql "${conn[@]}" -X -A -t -q -v ON_ERROR_STOP=1 -f /ops/backup-checks.sql; }

before="$(checks)" || fail "checks on the source failed"
pg pg_dump "${conn[@]}" --data-only --format=custom --compress=9 \
  --schema=public --schema=auth \
  --exclude-table-data=auth.schema_migrations --exclude-table-data=auth.audit_log_entries \
  --file="/out/$BASE.dump.part" 2> >(grep -v -e 'circular foreign-key' -e '^pg_dump: \(detail\|hint\):' >&2) ||
  { rm -f "$OUT/$BASE.dump.part"; fail "pg_dump failed"; }
after="$(checks)" || fail "checks on the source failed"

if [ "$before" != "$after" ]; then
  # Something was written during the dump (an SMS, a notification). Try once more rather than keep a doubtful file.
  rm -f "$OUT/$BASE.dump.part"
  if [ "${DB_BACKUP_RETRY:-1}" = 1 ]; then
    echo "db-backup: the data changed during the dump; trying again in 60 s" >&2
    sleep 60
    DB_BACKUP_RETRY=0 exec "$0" "$@"
  fi
  fail "the data changed during the dump twice; no backup written"
fi

mv "$OUT/$BASE.dump.part" "$OUT/$BASE.dump"
chmod 600 "$OUT/$BASE.dump"
printf '%s\n' "$after" >"$OUT/$BASE.checks"

# Retention: the newest $KEEP dumps (and their .checks) stay.
ls -1t "$OUT"/pesa-"$ENV_NAME"-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "${old%.dump}.checks"
done

rows="$(grep -c '^rows ' "$OUT/$BASE.checks")"
tx="$(grep '^rows public.transactions|' "$OUT/$BASE.checks" | cut -d'|' -f2)"
size="$(du -h "$OUT/$BASE.dump" | cut -f1)"
echo "db-backup: $ENV_NAME ok · $BASE.dump ($size) · $rows tables · $tx transactions · kept $(ls -1 "$OUT"/*.dump | wc -l)"
