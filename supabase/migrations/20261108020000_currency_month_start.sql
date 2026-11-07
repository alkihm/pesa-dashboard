-- [4.9] part B: the ledger's currency and the day the budget month starts (owner, 2026-11-08; D-016).
-- A budget month keeps the key of the calendar month it starts in: with start day D, month 2026-11-01 runs from
-- D Nov 00:00 to D Dec 00:00, Nairobi time. D = 1 is the calendar month, so nothing changes until the owner picks
-- another day. Bills and budget items stay on calendar months (they are due on real dates).

alter table public.settings
  add column currency text not null default 'KES'
    check (currency in ('KES', 'UGX', 'TZS', 'RWF', 'USD', 'EUR', 'GBP')),
  add column month_start_day smallint not null default 1 check (month_start_day between 1 and 28);

comment on column public.settings.currency is
  'The currency the accounts are kept in; shown on every amount. Amounts are never converted.';
comment on column public.settings.month_start_day is
  'Day of the month the budget month starts (1-28). Month totals and category totals follow it.';

-- The budget month a Nairobi local time falls in, keyed by the first day of the month it starts in.
create function public.budget_month(p_local timestamp, p_start_day integer)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select date_trunc('month', p_local - make_interval(days => greatest(1, least(28, coalesce(p_start_day, 1))) - 1))::date
$$;

comment on function public.budget_month is
  'First day of the calendar month the budget month starts in, for a Nairobi local time and a start day (1-28).';

create or replace view public.month_totals with (security_invoker = true) as
select
  t.user_id,
  public.budget_month(t.occurred_at at time zone 'Africa/Nairobi', s.month_start_day) as month,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'income'), 0)::bigint as income_cents,
  coalesce(-sum(t.amount_cents) filter (where t.kind = 'spending'), 0)::bigint as spending_cents,
  coalesce(-sum(t.amount_cents) filter (where t.kind = 'spending' and t.channel = 'fee'), 0)::bigint as fees_cents,
  coalesce(-sum(t.amount_cents) filter (where t.kind = 'transfer' and a.kind in ('loan', 'card') and t.amount_cents < 0), 0)::bigint
    as borrowed_cents,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'transfer' and a.kind in ('loan', 'card') and t.amount_cents > 0), 0)::bigint
    as repaid_cents,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'transfer' and a.kind = 'savings'), 0)::bigint as saved_cents
from public.transactions t
join public.accounts a on a.id = t.account_id
left join public.settings s on s.user_id = t.user_id
where t.deleted_at is null
group by t.user_id, 2;

comment on view public.month_totals is
  'Per budget month (settings.month_start_day, Nairobi time). Borrowed, repaid and saved come from transfers by account kind (D-009 rule 3).';

create or replace view public.category_month_totals with (security_invoker = true) as
select
  t.user_id,
  public.budget_month(t.occurred_at at time zone 'Africa/Nairobi', s.month_start_day) as month,
  t.category_id,
  t.kind,
  (case when t.kind = 'spending' then -sum(t.amount_cents) else sum(t.amount_cents) end)::bigint as total_cents,
  count(*)::integer as transaction_count
from public.transactions t
left join public.settings s on s.user_id = t.user_id
where t.deleted_at is null and t.kind in ('spending', 'income')
group by t.user_id, 2, t.category_id, t.kind;

comment on view public.category_month_totals is
  'Per budget month (settings.month_start_day, Nairobi time), category and kind.';
