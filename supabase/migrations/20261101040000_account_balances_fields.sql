-- account_balances gains the fields the screens need next to the numbers ([1.8]): emoji, sort order,
-- archived, and whether the latest reading came from an SMS or a manual count. New columns go last,
-- as create or replace view requires.

create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.kind,
  a.debt_term,
  a.counts_in_net,
  coalesce(live.balance_cents, 0)::bigint as balance_cents,
  live.last_activity,
  snap.as_of as snapshot_at,
  snap.balance_cents as snapshot_cents,
  case when snap.as_of is null then null
       else snap.balance_cents - coalesce(at_snap.ledger_cents, 0) end::bigint as difference_cents,
  a.emoji,
  a.sort_order,
  a.archived_at,
  snap.source as snapshot_source
from public.accounts a
left join lateral (
  select sum(t.amount_cents) as balance_cents, max(t.occurred_at) as last_activity
    from public.transactions t
   where t.account_id = a.id and t.deleted_at is null
) live on true
left join lateral (
  select s.as_of, s.balance_cents, s.source
    from public.balance_snapshots s
   where s.account_id = a.id
   order by s.as_of desc, s.created_at desc
   limit 1
) snap on true
left join lateral (
  select sum(t.amount_cents) as ledger_cents
    from public.transactions t
   where t.account_id = a.id and t.deleted_at is null and t.occurred_at <= snap.as_of
) at_snap on true;
