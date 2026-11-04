-- [3.2] Bills paid from SMS (D-015). When an SMS payment arrives, the bill it pays is marked paid for its month,
-- shown as "Paid · via SMS". A bill matches a payment when:
--   1. the payment is a live spending row from an SMS (not a fee row) leaving an account;
--   2. its payee contains the bill's payee_match, ignoring case (the same test payee rules use);
--   3. the amount is within 20% of the bill's amount for that month, and never closer than KES 50 either way
--      (bills may be estimates);
--   4. the payment's Nairobi date is within 15 days of a due date the bill still owes (not paid, not skipped).
-- The nearest due date wins, then the nearest amount. A month's row is made if it does not exist yet, so rent
-- paid on 28 Oct for 1 Nov is matched before anyone opens November.
--
-- A month paid by a live SMS cannot be set back to due by an ordinary update ("cannot be undone by mistake");
-- unmatch_bill_payment() does it on purpose, and deleting the payment sets the month back to due by itself.

-- ---- matching -----------------------------------------------------------------------------------------------

create function public.bill_amount_fits(p_expected bigint, p_paid bigint) returns boolean
language sql immutable as $$
  select abs(p_paid - p_expected) <= greatest(p_expected / 5, 5000)
$$;

comment on function public.bill_amount_fits is
  'True when a payment is close enough to a bill''s amount: within 20%, at least KES 50 either way (D-015).';

-- Pays the best-fitting bill month with one transaction; returns the bill_months id, or null when nothing fits.
-- p_bill_id limits the search to one bill (used when a bill is added or changed). Runs as the caller.
create function public.match_bill_payment(p_transaction_id uuid, p_bill_id uuid default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t transactions%rowtype;
  d date;
  paid bigint;
  best record;
  v_id uuid;
begin
  select * into t from transactions where id = p_transaction_id;
  if not found or t.source <> 'sms' or t.kind <> 'spending' or t.deleted_at is not null
     or coalesce(t.channel, '') = 'fee' or t.amount_cents >= 0 then
    return null;
  end if;
  -- One payment pays one bill month.
  if exists (select 1 from bill_months where transaction_id = t.id) then
    return null;
  end if;

  d := (t.occurred_at at time zone 'Africa/Nairobi')::date;
  paid := -t.amount_cents;

  select c.bill_id, c.month, c.due_on, c.amount_cents into best
    from (
      select b.id as bill_id, m.month,
             (m.month + (least(b.due_day, extract(day from (m.month + interval '1 month - 1 day'))::int) - 1))
               as due_on,
             coalesce(bm.amount_cents, b.amount_cents) as amount_cents,
             coalesce(bm.status, 'due') as status
        from bills b
        cross join lateral (
          select (date_trunc('month', d) + make_interval(months => k))::date as month
            from generate_series(-1, 1) as k
        ) m
        left join bill_months bm on bm.bill_id = b.id and bm.month = m.month
       where b.user_id = t.user_id and b.archived_at is null
         and (p_bill_id is null or b.id = p_bill_id)
         and length(trim(coalesce(b.payee_match, ''))) > 0
         and position(upper(trim(b.payee_match)) in upper(coalesce(t.payee, ''))) > 0
         and b.starts_on < (m.month + interval '1 month')::date
    ) c
   where c.status = 'due'
     and abs(c.due_on - d) <= 15
     and bill_amount_fits(c.amount_cents, paid)
   order by abs(c.due_on - d), abs(c.amount_cents - paid), c.due_on
   limit 1;

  if not found then
    return null;
  end if;

  insert into bill_months (user_id, bill_id, month, due_on, amount_cents)
  values (t.user_id, best.bill_id, best.month, best.due_on, best.amount_cents)
  on conflict (bill_id, month) do nothing;

  update bill_months
     set status = 'paid', paid_at = t.occurred_at, transaction_id = t.id
   where bill_id = best.bill_id and month = best.month and status = 'due'
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.match_bill_payment is
  'Marks the bill month an SMS payment pays (D-015). Returns the bill_months id or null. Safe to call again.';

-- A new SMS payment: look for the bill it pays.
create function public.transactions_pay_bill() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  perform match_bill_payment(new.id);
  return null;
end;
$$;

create trigger transactions_pay_bill after insert on public.transactions
  for each row when (new.source = 'sms' and new.kind = 'spending')
  execute function public.transactions_pay_bill();

-- A deleted payment no longer pays its bill.
create function public.transactions_unpay_bill() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  update bill_months set status = 'due', paid_at = null, transaction_id = null
   where transaction_id = new.id;
  return null;
end;
$$;

create trigger transactions_unpay_bill after update of deleted_at on public.transactions
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.transactions_unpay_bill();

-- A bill added or given a payee (or a new amount or due day): match the last 45 days of SMS payments, oldest
-- first, so a bill set up after it was paid shows as paid.
create function public.bills_match_recent() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  r record;
begin
  if length(trim(coalesce(new.payee_match, ''))) = 0 or new.archived_at is not null then
    return null;
  end if;
  for r in
    select t.id from transactions t
     where t.user_id = new.user_id and t.source = 'sms' and t.kind = 'spending' and t.deleted_at is null
       and t.occurred_at >= now() - interval '45 days'
       and position(upper(trim(new.payee_match)) in upper(coalesce(t.payee, ''))) > 0
       and not exists (select 1 from bill_months bm where bm.transaction_id = t.id)
     order by t.occurred_at
  loop
    perform match_bill_payment(r.id, new.id);
  end loop;
  return null;
end;
$$;

create trigger bills_match_recent after insert or update of payee_match, amount_cents, due_day on public.bills
  for each row execute function public.bills_match_recent();

-- ---- not undone by mistake ----------------------------------------------------------------------------------

create function public.bill_months_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if old.status = 'paid' and old.transaction_id is not null
     and (new.status, new.transaction_id) is distinct from (old.status, old.transaction_id)
     and coalesce(current_setting('pesa.bill_unmatch', true), '') <> 'on'
     and exists (select 1 from transactions t
                  where t.id = old.transaction_id and t.source = 'sms' and t.deleted_at is null) then
    raise exception 'this bill was paid by an SMS payment; unmatch it on purpose with unmatch_bill_payment()'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger bill_months_guard before update on public.bill_months
  for each row execute function public.bill_months_guard();

-- Sets an SMS-paid month back to due, for a payment that was matched to the wrong bill. The payment stays as it
-- is. Runs as the caller, so row-level security limits it to the owner's rows.
create function public.unmatch_bill_payment(p_bill_month_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  n integer;
begin
  perform set_config('pesa.bill_unmatch', 'on', true);
  update bill_months set status = 'due', paid_at = null, transaction_id = null
   where id = p_bill_month_id and status = 'paid';
  get diagnostics n = row_count;
  perform set_config('pesa.bill_unmatch', '', true);
  if n = 0 then
    raise exception 'bill month % is not paid', p_bill_month_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.bill_amount_fits, public.match_bill_payment, public.unmatch_bill_payment
  from public, anon;
grant execute on function public.bill_amount_fits, public.match_bill_payment, public.unmatch_bill_payment
  to authenticated, service_role;
