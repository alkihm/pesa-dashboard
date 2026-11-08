#!/usr/bin/env bash
# [5.4] Restore drill: proves a backup from ops/db-backup.sh brings the data back. Runbook: docs/BACKUPS.md.
#
#   ops/restore-drill.sh dev                 newest dev backup
#   ops/restore-drill.sh dev <file.dump>     a given one
#   KEEP_DRILL=1 ops/restore-drill.sh dev    leave the drill stack running afterwards (db on port 54422)
#
# Same path as a real restore, into a THROWAWAY local Supabase stack (project "pesa-restore-drill", every port +100,
# Postgres 17 like the cloud): start it, which applies supabase/migrations from this checkout (the schema), then load
# the dump's data (public tables + auth.users / auth.identities) with triggers off, then run ops/backup-checks.sql and
# compare it line by line with the .checks taken on the source when the backup was made. Exit 0 only if every row
# count, table md5 and ledger total matches. Never touches a cloud project or the shared local stack.
set -euo pipefail

ENV_NAME="${1:-}"
case "$ENV_NAME" in dev | prod) ;; *) echo "usage: ops/restore-drill.sh dev|prod [file.dump]" >&2; exit 2 ;; esac

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PRIVATE="${PRIVATE_DIR:-$REPO/../private}"
BACKUPS="$PRIVATE/backups/$ENV_NAME"
DUMP="${2:-$(ls -1t "$BACKUPS"/pesa-"$ENV_NAME"-*.dump 2>/dev/null | head -1)}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
DRILL="${DRILL_DIR:-${TMPDIR:-/tmp}/pesa-restore-drill}"
DB_PORT=54422

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31mrestore-drill: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$DUMP" ] && [ -f "$DUMP" ] || fail "no backup found in $BACKUPS (run ops/db-backup.sh $ENV_NAME first)"
EXPECTED="${DUMP%.dump}.checks"
[ -f "$EXPECTED" ] || fail "missing $EXPECTED next to the dump"
# Postgres 17 needs a newer CLI than the shared one on the server (2.20.5 knows only 15); npx fetches it once.
SUPABASE_CLI="${SUPABASE_CLI:-npx -y supabase@2.122.1}"
sb() { (cd "$DRILL" && $SUPABASE_CLI "$@"); }

say "1/5 drill project in $DRILL"
rm -rf "$DRILL"
mkdir -p "$DRILL/supabase"
cp -r "$REPO/supabase/migrations" "$DRILL/supabase/"
# Own name and ports so it never meets the shared stack; Postgres 17 like the cloud; no seed (the data is the dump).
sed -e 's/^project_id = .*/project_id = "pesa-restore-drill"/' \
  -e 's/^major_version = .*/major_version = 17/' \
  -e 's/= 543\([0-9][0-9]\)$/= 544\1/' -e 's/^inspector_port = 8083/inspector_port = 8183/' \
  "$REPO/supabase/config.toml" |
  awk '/^\[/{seed=($0=="[db.seed]")} seed&&/^enabled =/{$0="enabled = false"} {print}' \
    >"$DRILL/supabase/config.toml"
grep -q "^port = $DB_PORT" "$DRILL/supabase/config.toml" || fail "could not move the drill db to port $DB_PORT"

stop() { [ "${KEEP_DRILL:-0}" = 1 ] || sb stop --no-backup >/dev/null 2>&1 || true; }
trap stop EXIT

say "2/5 start a fresh stack (applies $(ls "$DRILL/supabase/migrations" | wc -l) migrations)"
sb start -x studio,imgproxy,mailpit,storage-api,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,postgrest,kong \
  >"$DRILL/start.log" 2>&1 || { tail -20 "$DRILL/start.log"; fail "supabase start failed"; }

pg() { docker run --rm -i --network host --user "$(id -u):$(id -g)" -e PGPASSWORD=postgres \
  -v "$(dirname "$DUMP"):/in:ro" -v "$DRILL:/drill" -v "$REPO/ops:/ops:ro" "$PG_IMAGE" "$@"; }
# supabase_admin is the superuser of a local stack: needed to load with triggers (and foreign keys) off.
admin=(-h 127.0.0.1 -p "$DB_PORT" -U supabase_admin -d postgres)

say "3/5 load $(basename "$DUMP")"
# Only what the backup is for: public data and the auth users it belongs to. The cloud's other auth tables
# (sessions, tokens, MFA) are not restored: the owner signs in again.
pg sh -c "pg_restore -l /in/$(basename "$DUMP") | grep -E 'TABLE DATA public |TABLE DATA auth (users|identities) |SEQUENCE SET public '" \
  >"$DRILL/restore.list"
[ -s "$DRILL/restore.list" ] || fail "nothing to restore in the dump"
pg pg_restore "${admin[@]}" --data-only --disable-triggers --no-owner --single-transaction --exit-on-error \
  -L /drill/restore.list "/in/$(basename "$DUMP")" || fail "pg_restore failed"

say "4/5 compare with the source"
pg psql "${admin[@]}" -X -A -t -q -v ON_ERROR_STOP=1 -f /ops/backup-checks.sql >"$DRILL/restored.checks"
if diff -u "$EXPECTED" "$DRILL/restored.checks" >"$DRILL/diff.txt"; then
  n="$(grep -c . "$EXPECTED")"
  tx="$(grep '^rows public.transactions|' "$EXPECTED" | cut -d'|' -f2)"
  total="$(grep '^money ledger total cents|' "$EXPECTED" | cut -d'|' -f2)"
  echo "  ✓ all $n checks match: $tx transactions, ledger total $total cents, every table md5 equal"
else
  cat "$DRILL/diff.txt"
  fail "restored data differs from the source (diff above, also in $DRILL/diff.txt)"
fi

say "5/5 done"
[ "${KEEP_DRILL:-0}" = 1 ] && echo "  drill stack left running: psql -h 127.0.0.1 -p $DB_PORT -U postgres (stop: cd $DRILL && $SUPABASE_CLI stop --no-backup)" ||
  echo "  drill stack removed"
