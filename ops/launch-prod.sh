#!/usr/bin/env bash
# [5.7] Production launch, in order, stopping at the first failure. Runbook: docs/LAUNCH.md.
#
#   ops/launch-prod.sh                 dry run (default): read-only checks against prod, prints what --apply would do
#   ops/launch-prod.sh --prepare       writes private/env/functions-prod.env with new random keys (nothing touches prod)
#   OWNER_APPROVED=yes ops/launch-prod.sh --apply [--from <step>]
#                                      does it. Only after the owner has read a dry run and said so in that session.
#
# Steps: preflight → db → owner → categories → secrets → functions → vault → cron. Each step is safe to run again.
# Secrets are read from private/env/ on the server and never printed: only their names are.
set -euo pipefail

MODE=dry
FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) MODE=apply ;;
    --prepare) MODE=prepare ;;
    --from) FROM="$2"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PRIVATE="${PRIVATE_ENV:-$REPO/../private/env}"
DB_CONTAINER="${DB_CONTAINER:-supabase_db_pesa-dashboard}" # only its psql binary is used, to reach the prod pooler
POOLER="aws-1-eu-central-1.pooler.supabase.com"
STEPS=(preflight db owner categories secrets functions vault cron)
FUNCTION_SECRETS=(INTAKE_KEY INTAKE_USER_ID OWNER_USER_ID BACKUP_KEY BACKUP_SHEET_ID GOOGLE_SERVICE_ACCOUNT
  NOTIFY_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT)

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
would() { printf '  \033[33m→ would:\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
need_file() { [ -f "$1" ] || fail "missing $1 (see docs/LAUNCH.md, 'Before you start')"; }
# Value of KEY in an env file, without echoing it anywhere.
val() { { grep -E "^$2=" "$1" || true; } | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

PROD_ENV="$PRIVATE/supabase-prod.env"
FN_ENV="$PRIVATE/functions-prod.env"
LAUNCH_ENV="$PRIVATE/launch-prod.env"

if [ "$MODE" = prepare ]; then
  say "prepare: $FN_ENV"
  [ -f "$FN_ENV" ] && fail "$FN_ENV exists already; delete it first if you really want new keys"
  source ~/.nvm/nvm.sh >/dev/null 2>&1 || true
  rnd() { openssl rand -hex 32; }
  vapid="$(node -e '
    const { generateKeyPairSync } = require("node:crypto");
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const j = privateKey.export({ format: "jwk" });
    const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]);
    console.log(pub.toString("base64url") + " " + j.d);
  ')"
  umask 077
  {
    echo "# Production Edge Function secrets, written by ops/launch-prod.sh --prepare. Never commit."
    echo "INTAKE_KEY=$(rnd)"
    echo "BACKUP_KEY=$(rnd)"
    echo "NOTIFY_KEY=$(rnd)"
    echo "VAPID_PUBLIC_KEY=${vapid% *}"
    echo "VAPID_PRIVATE_KEY=${vapid#* }"
    echo "VAPID_SUBJECT=$(val "$PRIVATE/vapid-dev.env" VAPID_SUBJECT)"
    echo "BACKUP_SHEET_ID="
    echo "GOOGLE_SERVICE_ACCOUNT=$(tr -d '\n' <"$PRIVATE/google-backup.json")"
    echo "# INTAKE_USER_ID and OWNER_USER_ID are added by the owner step once the owner has signed in on prod."
  } >"$FN_ENV"
  chmod 600 "$FN_ENV"
  ok "written (600). Fill BACKUP_SHEET_ID (a new prod backup Sheet, shared with the service account)."
  exit 0
fi

if [ "$MODE" = apply ] && [ "${OWNER_APPROVED:-}" != yes ]; then
  fail "--apply needs OWNER_APPROVED=yes: the owner approves the prod push in the session (D-019)"
fi

need_file "$PROD_ENV"
REF="$(val "$PROD_ENV" SUPABASE_PROJECT_REF)"
DB_PASSWORD="$(val "$PROD_ENV" SUPABASE_DB_PASSWORD)"
[ -n "$REF" ] && [ -n "$DB_PASSWORD" ] || fail "SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD missing in $PROD_ENV"
DEV_REF="$(val "$PRIVATE/supabase-dev.env" SUPABASE_PROJECT_REF 2>/dev/null || true)"
[ "$REF" != "$DEV_REF" ] || fail "the prod env file holds the dev ref"
DB_URL="postgresql://postgres.$REF:$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DB_PASSWORD")@$POOLER:5432/postgres"
FN_URL="https://$REF.supabase.co/functions/v1"

# psql against prod, read from stdin, values passed as psql variables (-v name=value).
prod_sql() {
  docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" \
    psql "host=$POOLER port=5432 user=postgres.$REF dbname=postgres sslmode=require" \
    -X -q -A -t -v ON_ERROR_STOP=1 "$@"
}

run_step() {
  case "$1" in
    preflight)
      for t in supabase docker node openssl git; do command -v "$t" >/dev/null || fail "$t not found"; done
      ok "tools: supabase $(supabase --version 2>/dev/null | head -1), docker, node, openssl"
      branch="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
      dirty="$(git -C "$REPO" status --porcelain | grep -v '^??' || true)"
      [ -z "$dirty" ] || fail "uncommitted changes in $REPO"
      # The database goes first, then the release PR merges (main deploys to Vercel production), so --apply runs
      # from the release commit: the tip of origin/dev (the release PR's head) or origin/main.
      git -C "$REPO" fetch -q origin dev main
      head="$(git -C "$REPO" rev-parse HEAD)"
      if [ "$head" = "$(git -C "$REPO" rev-parse origin/dev)" ] || [ "$head" = "$(git -C "$REPO" rev-parse origin/main)" ]; then
        ok "at the release commit $(git -C "$REPO" rev-parse --short HEAD) ($branch)"
      else
        [ "$MODE" = apply ] && fail "--apply runs at the tip of origin/dev or origin/main (on $branch, $(git -C "$REPO" rev-parse --short HEAD))"
        ok "on $branch (fine for a dry run; --apply runs at the release commit)"
      fi
      [ "$(prod_sql -c 'select 1')" = 1 ] || fail "cannot reach the prod database"
      ok "prod database reachable (ref ${REF:0:6}…)"
      ;;
    db)
      if [ "$MODE" = apply ]; then
        (cd "$REPO" && supabase db push --db-url "$DB_URL")
        ok "migrations applied"
      else
        (cd "$REPO" && supabase db push --db-url "$DB_URL" --dry-run)
      fi
      ;;
    owner)
      if [ ! -f "$LAUNCH_ENV" ]; then
        [ "$MODE" = apply ] && fail "missing $LAUNCH_ENV (OWNER_EMAIL=<the Google account you sign in with>)"
        would "look up the owner by OWNER_EMAIL from launch-prod.env (file not written yet)"
        return
      fi
      email="$(val "$LAUNCH_ENV" OWNER_EMAIL)"
      [ -n "$email" ] || fail "OWNER_EMAIL missing in $LAUNCH_ENV"
      if [ "$(prod_sql -c "select to_regclass('auth.users') is not null")" != t ]; then fail "no auth schema on prod"; fi
      OWNER_ID="$(prod_sql -v email="$email" <<<"select id from auth.users where email = :'email';")"
      if [ -z "$OWNER_ID" ]; then
        [ "$MODE" = apply ] && fail "the owner has not signed in on prod yet: open the production site, sign in with Google, then run again with --from owner"
        would "find the owner's user id after their first Google sign-in on prod (not signed in yet)"
        return
      fi
      ok "owner user found (${OWNER_ID:0:8}…)"
      if [ "$MODE" = apply ] && [ -f "$FN_ENV" ]; then
        sed -i -e '/^INTAKE_USER_ID=/d' -e '/^OWNER_USER_ID=/d' "$FN_ENV"
        printf 'INTAKE_USER_ID=%s\nOWNER_USER_ID=%s\n' "$OWNER_ID" "$OWNER_ID" >>"$FN_ENV"
        ok "INTAKE_USER_ID and OWNER_USER_ID written to functions-prod.env"
      fi
      ;;
    categories)
      # Intake files fees under the system category "Transaction fees"; "Uncategorised" is the fallback. The seed
      # has them for the sample user only, and nothing creates them for a new user.
      [ -n "${OWNER_ID:-}" ] || { would "add the system categories once the owner exists"; return; }
      sql="insert into public.categories (user_id, name, emoji, colour, kind, system, sort_order)
        select :'owner', v.name, v.emoji, v.colour, 'spending', true, v.sort from (values
          ('Transaction fees', '🧾', 'cat-8', 8), ('Uncategorised', '❓', 'cat-12', 11)) v(name, emoji, colour, sort)
        where not exists (select 1 from public.categories c
          where c.user_id = :'owner' and c.system and lower(c.name) = lower(v.name));"
      if [ "$MODE" = apply ]; then
        prod_sql -v owner="$OWNER_ID" <<<"$sql"
        ok "system categories present"
      else
        have="$(prod_sql -v owner="$OWNER_ID" <<<"select count(*) from public.categories where user_id = :'owner' and system;" 2>/dev/null || echo "?")"
        would "add the missing system categories (owner has $have of 2)"
      fi
      ;;
    secrets)
      if [ ! -f "$FN_ENV" ]; then
        [ "$MODE" = apply ] && fail "missing $FN_ENV: run ops/launch-prod.sh --prepare"
        would "set ${FUNCTION_SECRETS[*]} (functions-prod.env not prepared yet: --prepare)"
        return
      fi
      missing=()
      for k in "${FUNCTION_SECRETS[@]}"; do [ -n "$(val "$FN_ENV" "$k")" ] || missing+=("$k"); done
      if [ "$MODE" = apply ]; then
        [ ${#missing[@]} -eq 0 ] || fail "empty in functions-prod.env: ${missing[*]}"
        supabase secrets set --project-ref "$REF" --env-file "$FN_ENV" >/dev/null
        ok "function secrets set: ${FUNCTION_SECRETS[*]}"
        # What the iPhone Shortcut needs for the cut-over ([5.3]), same layout as intake-dev.env.
        (umask 077 && printf 'INTAKE_URL=%s\nINTAKE_KEY=%s\nINTAKE_USER_ID=%s\n' "$FN_URL/intake" \
          "$(val "$FN_ENV" INTAKE_KEY)" "$(val "$FN_ENV" INTAKE_USER_ID)" >"$PRIVATE/intake-prod.env")
        ok "intake-prod.env written (for the Shortcut)"
      else
        would "set ${FUNCTION_SECRETS[*]} from functions-prod.env"
        [ ${#missing[@]} -eq 0 ] || printf '    still empty: %s\n' "${missing[*]}"
      fi
      ;;
    functions)
      (cd "$REPO" && node scripts/sync-functions.mjs >/dev/null)
      for dir in "$REPO"/supabase/functions/*/; do
        name="$(basename "$dir")"
        [ "$name" = _shared ] && continue
        # All three check their own key or the user's token, so none relies on the gateway's JWT check.
        if [ "$MODE" = apply ]; then
          (cd "$REPO" && supabase functions deploy "$name" --project-ref "$REF" --no-verify-jwt)
          ok "deployed $name"
        else would "deploy $name --no-verify-jwt"; fi
      done
      ;;
    vault)
      if [ "$MODE" = apply ]; then
        prod_sql -v url="$FN_URL/sheet-backup" -v key="$(val "$FN_ENV" BACKUP_KEY)" \
          -v nurl="$FN_URL/notify" -v nkey="$(val "$FN_ENV" NOTIFY_KEY)" <<'SQL'
select vault.update_secret(id, :'url') from vault.secrets where name = 'sheet_backup_url';
select vault.create_secret(:'url', 'sheet_backup_url') where not exists (select 1 from vault.secrets where name = 'sheet_backup_url');
select vault.update_secret(id, :'key') from vault.secrets where name = 'sheet_backup_key';
select vault.create_secret(:'key', 'sheet_backup_key') where not exists (select 1 from vault.secrets where name = 'sheet_backup_key');
select vault.update_secret(id, :'nurl') from vault.secrets where name = 'notify_url';
select vault.create_secret(:'nurl', 'notify_url') where not exists (select 1 from vault.secrets where name = 'notify_url');
select vault.update_secret(id, :'nkey') from vault.secrets where name = 'notify_key';
select vault.create_secret(:'nkey', 'notify_key') where not exists (select 1 from vault.secrets where name = 'notify_key');
SQL
        ok "Vault: sheet_backup_url, sheet_backup_key, notify_url, notify_key"
      else
        have="$(prod_sql -c "select coalesce(string_agg(name, ', ' order by name), 'none') from vault.secrets where name in ('sheet_backup_url','sheet_backup_key','notify_url','notify_key')" 2>/dev/null || echo "vault not readable")"
        would "set Vault sheet_backup_url, sheet_backup_key, notify_url, notify_key (prod has: $have)"
      fi
      ;;
    cron)
      jobs="$(prod_sql -c "select coalesce(string_agg(jobname || ' ' || schedule, '; ' order by jobname), '') from cron.job" 2>/dev/null || true)"
      if [ "$MODE" = apply ]; then
        for j in notify sheet-backup; do [[ "$jobs" == *"$j "* ]] || fail "pg_cron job $j missing after the migrations"; done
        ok "pg_cron: $jobs"
      else
        would "check pg_cron jobs notify and sheet-backup exist (the migrations create them; prod has: ${jobs:-none})"
      fi
      ;;
  esac
}

say "launch-prod — mode: $MODE${FROM:+, from $FROM}"
started=$([ -z "$FROM" ] && echo 1 || echo 0)
OWNER_ID=""
for s in "${STEPS[@]}"; do
  [ "$s" = "$FROM" ] && started=1
  # The owner id is needed by later steps, so look it up even when resuming past it.
  if [ "$started" = 0 ]; then
    [ "$s" = owner ] && [ -f "$LAUNCH_ENV" ] &&
      OWNER_ID="$(prod_sql -v email="$(val "$LAUNCH_ENV" OWNER_EMAIL)" <<<"select id from auth.users where email = :'email';" || true)"
    continue
  fi
  say "$s"
  run_step "$s"
done
say "done ($MODE). Owner steps that no script does: docs/LAUNCH.md, 'By hand'."
