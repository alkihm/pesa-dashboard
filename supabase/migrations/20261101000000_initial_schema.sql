-- Initial schema: the data model of docs/ARCHITECTURE.md, decided in D-009.
--
-- Every table has id, user_id, created_at, updated_at and version. Money is bigint cents (D-007).
-- Fixed lists are text + check. Row-level security is switched on for every table here with no policies,
-- so nothing is readable through the API until [1.2] adds the owner policies.

-- ---------------------------------------------------------------------------------------------------------
-- Shared helpers

create function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function public.touch_row() is
  'Bumps updated_at and version on every update; offline edits send the version they started from.';

-- ---------------------------------------------------------------------------------------------------------
-- accounts

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  emoji text,
  kind text not null check (kind in ('wallet', 'bank', 'cash', 'savings', 'loan', 'card')),
  debt_term text check (debt_term in ('short', 'long')),
  counts_in_net boolean not null,
  sms_sender text,
  sms_account_hint text,
  limit_cents bigint check (limit_cents >= 0),
  original_cents bigint check (original_cents >= 0),
  due_day smallint check (due_day between 1 and 31),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint accounts_debt_term_for_debt check ((debt_term is not null) = (kind in ('loan', 'card')))
);

create index accounts_user_idx on public.accounts (user_id, sort_order);

-- counts_in_net defaults by kind when the app does not send it (ARCHITECTURE: accounts).
create function public.accounts_defaults() returns trigger
language plpgsql as $$
begin
  if new.counts_in_net is null then
    new.counts_in_net := new.kind in ('wallet', 'bank', 'cash') or coalesce(new.debt_term = 'short', false);
  end if;
  return new;
end;
$$;

create trigger accounts_defaults before insert on public.accounts
  for each row execute function public.accounts_defaults();

-- ---------------------------------------------------------------------------------------------------------
-- categories

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  emoji text,
  colour text not null check (colour ~ '^cat-([1-9]|1[0-2])$'),
  kind text not null check (kind in ('spending', 'income')),
  monthly_budget_cents bigint check (monthly_budget_cents >= 0),
  system boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint categories_system_not_archived check (not (system and archived_at is not null))
);

create unique index categories_name_idx on public.categories (user_id, lower(name)) where archived_at is null;

-- ---------------------------------------------------------------------------------------------------------
-- payee_rules

create table public.payee_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern text not null check (length(trim(pattern)) > 0),
  priority integer not null default 100,
  category_id uuid references public.categories (id) on delete cascade,
  transfer_account_id uuid references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint payee_rules_one_target check (num_nonnulls(category_id, transfer_account_id) = 1)
);

create index payee_rules_user_idx on public.payee_rules (user_id, priority);

-- ---------------------------------------------------------------------------------------------------------
-- sms_messages

create table public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender text not null,
  body text not null,
  received_at timestamptz not null,
  hash text not null,
  parse_status text not null check (parse_status in ('parsed', 'ignored', 'to_review')),
  parser_version text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint sms_messages_hash_unique unique (user_id, hash)
);

create index sms_messages_received_idx on public.sms_messages (user_id, received_at desc);

-- ---------------------------------------------------------------------------------------------------------
-- import_batches

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null,
  row_count integer not null default 0 check (row_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

-- ---------------------------------------------------------------------------------------------------------
-- bills, budget_items (before transactions, which reference budget_items)

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  emoji text,
  amount_cents bigint not null check (amount_cents >= 0),
  due_day smallint not null check (due_day between 1 and 31),
  account_id uuid references public.accounts (id),
  category_id uuid references public.categories (id),
  payee_match text,
  starts_on date not null default date_trunc('month', now() at time zone 'Africa/Nairobi')::date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  account_id uuid not null references public.accounts (id),
  category_id uuid references public.categories (id),
  month date not null check (extract(day from month) = 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'done', 'cancelled')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint budget_items_approved_at check ((status = 'pending') = (approved_at is null) or status = 'cancelled')
);

-- ---------------------------------------------------------------------------------------------------------
-- transactions

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_at timestamptz not null,
  account_id uuid not null references public.accounts (id),
  amount_cents bigint not null check (amount_cents <> 0),
  kind text not null check (kind in ('spending', 'income', 'transfer', 'adjustment', 'opening')),
  category_id uuid references public.categories (id),
  transfer_id uuid,
  parent_id uuid references public.transactions (id),
  payee text,
  channel text,
  note text,
  reason text,
  source text not null check (source in ('sms', 'manual', 'import')),
  sms_id uuid references public.sms_messages (id),
  ref text,
  dedupe_key text,
  original_currency char(3),
  original_minor bigint,
  needs_review boolean not null default false,
  budget_item_id uuid references public.budget_items (id),
  import_batch_id uuid references public.import_batches (id) on delete cascade,
  deleted_at timestamptz,
  deleted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint transactions_transfer_id check ((kind = 'transfer') = (transfer_id is not null)),
  constraint transactions_category_kind check (category_id is null or kind in ('spending', 'income')),
  constraint transactions_adjustment_reason check (kind <> 'adjustment' or coalesce(length(trim(reason)), 0) > 0),
  constraint transactions_original check ((original_currency is null) = (original_minor is null)),
  constraint transactions_deleted_reason check (deleted_at is null or coalesce(length(trim(deleted_reason)), 0) > 0)
);

create unique index transactions_dedupe_idx on public.transactions (user_id, dedupe_key) where dedupe_key is not null;
create index transactions_user_time_idx on public.transactions (user_id, occurred_at desc);
create index transactions_account_time_idx on public.transactions (account_id, occurred_at);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_transfer_idx on public.transactions (transfer_id) where transfer_id is not null;
create index transactions_sms_idx on public.transactions (sms_id) where sms_id is not null;

-- A transaction's category must be of the same kind (spending category on spending rows).
-- Amount, account and time of an SMS row are locked unless it needs review (D-009 rule 5).
create function public.transactions_guard() returns trigger
language plpgsql as $$
declare
  cat_kind text;
begin
  if new.category_id is not null then
    select kind into cat_kind from public.categories where id = new.category_id;
    if cat_kind is distinct from new.kind then
      raise exception 'category % is a % category; this is a % transaction', new.category_id, cat_kind, new.kind;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.source = 'sms' and not old.needs_review
     and (new.amount_cents, new.account_id, new.occurred_at)
         is distinct from (old.amount_cents, old.account_id, old.occurred_at) then
    raise exception 'amount, account and time of an SMS transaction are locked; add a transaction or an adjustment';
  end if;

  return new;
end;
$$;

create trigger transactions_guard before insert or update on public.transactions
  for each row execute function public.transactions_guard();

-- The two legs of a transfer: different accounts, amounts summing to zero. Checked at commit, so both legs
-- can be written in one transaction. Soft-deleting one leg means deleting both.
create function public.check_transfer() returns trigger
language plpgsql as $$
declare
  t uuid;
  legs integer;
  accounts integer;
  total bigint;
begin
  -- An update can move a row out of one transfer and into another, so both groups are checked.
  foreach t in array array_remove(array[
    case when tg_op <> 'DELETE' then new.transfer_id end,
    case when tg_op <> 'INSERT' then old.transfer_id end
  ], null) loop
    select count(*), count(distinct account_id), coalesce(sum(amount_cents), 0)
      into legs, accounts, total
      from public.transactions
     where transfer_id = t and deleted_at is null;
    if legs <> 0 and (legs <> 2 or accounts <> 2 or total <> 0) then
      raise exception 'transfer % must be two live rows on different accounts summing to zero (found % rows, sum %)',
        t, legs, total;
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger transactions_transfer_balanced
  after insert or update or delete on public.transactions
  deferrable initially deferred
  for each row execute function public.check_transfer();

-- ---------------------------------------------------------------------------------------------------------
-- balance_snapshots

create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  balance_cents bigint not null,
  as_of timestamptz not null,
  source text not null check (source in ('sms', 'manual')),
  sms_id uuid references public.sms_messages (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint balance_snapshots_sms_source check ((source = 'sms') = (sms_id is not null)),
  constraint balance_snapshots_one_per_sms unique (sms_id, account_id)
);

create index balance_snapshots_account_idx on public.balance_snapshots (account_id, as_of desc);

-- ---------------------------------------------------------------------------------------------------------
-- bill_months

create table public.bill_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bill_id uuid not null references public.bills (id),
  month date not null check (extract(day from month) = 1),
  due_on date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'due' check (status in ('due', 'paid', 'skipped')),
  transaction_id uuid references public.transactions (id),
  paid_at timestamptz,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint bill_months_one_per_month unique (bill_id, month),
  constraint bill_months_paid check ((status = 'paid') = (paid_at is not null)),
  constraint bill_months_transaction check (transaction_id is null or status = 'paid')
);

create index bill_months_user_month_idx on public.bill_months (user_id, month);

-- Makes the month's row for every live bill that has started; safe to call again. Due day is clamped to the
-- month's last day. Runs as the caller, so row-level security applies.
create function public.ensure_bill_months(p_month date) returns setof public.bill_months
language plpgsql security invoker as $$
declare
  m date := date_trunc('month', p_month)::date;
  last_day integer := extract(day from (m + interval '1 month - 1 day'));
begin
  insert into public.bill_months (user_id, bill_id, month, due_on, amount_cents)
  select b.user_id, b.id, m, m + (least(b.due_day, last_day) - 1), b.amount_cents
    from public.bills b
   where b.archived_at is null and b.starts_on <= m + (last_day - 1)
  on conflict (bill_id, month) do nothing;

  return query select * from public.bill_months where month = m;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- reviews, review_checks

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result text check (result in ('all_match', 'fixed', 'left_open')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint reviews_result_when_complete check ((completed_at is null) = (result is null))
);

create table public.review_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  review_id uuid not null references public.reviews (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  ledger_cents bigint not null,
  stated_cents bigint,
  resolution text not null check (resolution in ('matched', 'added_transaction', 'adjustment', 'left_open')),
  transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint review_checks_one_per_account unique (review_id, account_id)
);

-- ---------------------------------------------------------------------------------------------------------
-- settings, pin_credentials, push_subscriptions

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique references auth.users (id) on delete cascade,
  review_interval_days smallint not null default 3 check (review_interval_days between 1 and 60),
  alerts jsonb not null default '{}'::jsonb,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  loan_allocation_pct smallint not null default 0 check (loan_allocation_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

-- No policy will ever be added: read and written only by security-definer functions (D-009 rule 10).
create table public.pin_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  pin_hash text not null,
  failed_attempts smallint not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

-- ---------------------------------------------------------------------------------------------------------
-- Every table: version trigger and row-level security (policies come in [1.2])

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'payee_rules', 'sms_messages', 'import_batches', 'bills', 'budget_items',
    'transactions', 'balance_snapshots', 'bill_months', 'reviews', 'review_checks', 'settings',
    'pin_credentials', 'push_subscriptions'
  ] loop
    execute format('create trigger touch_row before update on public.%I for each row execute function public.touch_row()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

revoke all on public.pin_credentials from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Views. security_invoker makes row-level security apply to the caller.

create view public.account_balances with (security_invoker = true) as
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
       else snap.balance_cents - coalesce(at_snap.ledger_cents, 0) end::bigint as difference_cents
from public.accounts a
left join lateral (
  select sum(t.amount_cents) as balance_cents, max(t.occurred_at) as last_activity
    from public.transactions t
   where t.account_id = a.id and t.deleted_at is null
) live on true
left join lateral (
  select s.as_of, s.balance_cents
    from public.balance_snapshots s
   where s.account_id = a.id
   order by s.as_of desc
   limit 1
) snap on true
left join lateral (
  select sum(t.amount_cents) as ledger_cents
    from public.transactions t
   where t.account_id = a.id and t.deleted_at is null and t.occurred_at <= snap.as_of
) at_snap on true;

comment on view public.account_balances is
  'Balance = sum of live transactions. difference_cents compares the latest snapshot with the ledger up to its time.';

create view public.month_totals with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.occurred_at at time zone 'Africa/Nairobi')::date as month,
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
where t.deleted_at is null
group by t.user_id, 2;

comment on view public.month_totals is
  'Per Nairobi month. Borrowed, repaid and saved come from transfers by account kind (D-009 rule 3).';

create view public.category_month_totals with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.occurred_at at time zone 'Africa/Nairobi')::date as month,
  t.category_id,
  t.kind,
  (case when t.kind = 'spending' then -sum(t.amount_cents) else sum(t.amount_cents) end)::bigint as total_cents,
  count(*)::integer as transaction_count
from public.transactions t
where t.deleted_at is null and t.kind in ('spending', 'income')
group by t.user_id, 2, t.category_id, t.kind;
