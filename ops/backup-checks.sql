-- [5.4] What a restore must reproduce exactly. One line per check, "name|value", sorted, so two runs diff cleanly:
-- the row count and an md5 of the full contents of every public table, the auth users the data belongs to, and the
-- money figures a person would look at (ledger total and per-account totals).
-- Used by ops/db-backup.sh (on the source, before and after the dump) and ops/restore-drill.sh (on the restore).
-- Read-only. Run with: psql -X -A -t -v ON_ERROR_STOP=1 -f ops/backup-checks.sql
set timezone = 'UTC';
set extra_float_digits = 0;

with tables as (
  select format('%I.%I', schemaname, tablename) as name
  from pg_tables
  where schemaname = 'public'
    or (schemaname = 'auth' and tablename in ('users', 'identities'))
),
measured as (
  select
    t.name,
    (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s', t.name), false, true, '')))[1]::text
      as n,
    (xpath(
      '/row/h/text()',
      query_to_xml(
        format('select md5(coalesce(string_agg(r::text, chr(10) order by r::text), %L)) as h from %s r', '', t.name),
        false, true, ''
      )
    ))[1]::text as h
  from tables t
)
select line from (
  select format('rows %s|%s', name, n) as line from measured
  union all
  select format('md5 %s|%s', name, h) from measured
  union all
  select format('money ledger total cents|%s', coalesce(sum(amount_cents), 0))
  from public.transactions where deleted_at is null
  union all
  select format('money account %s cents|%s', a.name, coalesce(sum(t.amount_cents), 0))
  from public.accounts a
  left join public.transactions t on t.account_id = a.id and t.deleted_at is null
  group by a.id, a.name
) lines
order by line;
