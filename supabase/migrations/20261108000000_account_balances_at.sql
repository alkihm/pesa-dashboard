-- [4.8] Month report: each account's ledger balance at a moment in the past, for "Position at month end". The same
-- rule as account_balances.balance_cents (the sum of live transactions), counting only rows dated before p_at.
-- Read-only and security invoker, so row-level security limits it to the caller's own accounts and transactions.
-- Owner's choice, 2026-11-08: a function rather than adding up transactions in the browser.

create function public.account_balances_at(p_at timestamptz)
returns table (
  account_id uuid,
  name text,
  kind text,
  debt_term text,
  counts_in_net boolean,
  archived_at timestamptz,
  balance_cents bigint
)
language sql stable security invoker set search_path = public as $$
  select a.id, a.name, a.kind, a.debt_term, a.counts_in_net, a.archived_at,
         coalesce((
           select sum(t.amount_cents)
             from transactions t
            where t.account_id = a.id and t.deleted_at is null and t.occurred_at < p_at
         ), 0)::bigint
    from accounts a
   where a.created_at < p_at or exists (
           select 1 from transactions t
            where t.account_id = a.id and t.deleted_at is null and t.occurred_at < p_at
         )
   order by a.sort_order, a.name;
$$;

comment on function public.account_balances_at(timestamptz) is
  'Each account''s ledger balance from live transactions dated before p_at (month report, [4.8]).';

-- Functions are executable by PUBLIC by default, which anon inherits; only signed-in users may call this one.
revoke execute on function public.account_balances_at(timestamptz) from public, anon;
grant execute on function public.account_balances_at(timestamptz) to authenticated;
