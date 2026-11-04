-- [3.2] Bills paid from SMS (D-015): which payments pay which bill month, and that an SMS-paid month is not
-- set back by mistake. Invented users, payees and amounts. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'dana@example.test', '{}', '{}', now(), now()),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'eli@example.test', '{}', '{}', now(), now());
insert into public.accounts (id, user_id, name, kind) values
  ('a4444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444444', 'Wallet', 'wallet'),
  ('a5555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555555', 'Wallet', 'wallet');

-- Dana's bills. Eli has a bill with the same payee, which Dana's payments must never touch.
insert into public.bills (id, user_id, name, amount_cents, due_day, payee_match, starts_on) values
  ('b4444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444444', 'Rent', 1250000, 1, 'test landlord', '2026-09-01'),
  ('b4444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444444', 'Gym', 200000, 20, 'DEMO GYM', '2026-09-01'),
  ('b4444444-4444-4444-8444-444444444443', '44444444-4444-4444-8444-444444444444', 'TV one', 150000, 15, 'DEMO TV', '2026-09-01'),
  ('b4444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'TV two', 150000, 15, 'DEMO TV', '2026-09-01'),
  ('b5555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555555', 'Rent', 1250000, 1, 'TEST LANDLORD', '2026-09-01');

-- An SMS payment from Dana's wallet. Times are UTC; 21:00 UTC is midnight in Nairobi.
create function pg_temp.pay(p_payee text, p_cents bigint, p_at timestamptz, p_source text default 'sms',
                            p_channel text default 'paybill') returns uuid language sql as $$
  insert into public.transactions (user_id, occurred_at, account_id, amount_cents, kind, payee, channel, source)
  values ('44444444-4444-4444-8444-444444444444', p_at, 'a4444444-4444-4444-8444-444444444441', -p_cents,
          'spending', p_payee, p_channel, p_source)
  returning id;
$$;

create function pg_temp.month_of(p_bill uuid, p_month date) returns public.bill_months language sql as $$
  select * from public.bill_months where bill_id = p_bill and month = p_month;
$$;

-- ---- the amount rule ---------------------------------------------------------------------------------------
select ok(public.bill_amount_fits(100000, 120000), '20% over a bill''s amount still fits');
select ok(not public.bill_amount_fits(100000, 120100), 'just over 20% does not');
select ok(public.bill_amount_fits(10000, 15000), 'small bills get at least KES 50 either way');
select ok(not public.bill_amount_fits(10000, 15100), 'but no more');

-- ---- a payment pays the month whose due date is nearest --------------------------------------------------
create temp table paid_early as
  select pg_temp.pay('TEST LANDLORD HOUSE7', 1250000, '2026-10-28T09:00:00Z') as id;

select is((pg_temp.month_of('b4444444-4444-4444-8444-444444444441', '2026-11-01')).status, 'paid',
  'rent paid on 28 Oct pays November (due 1 Nov), and the month row is made for it');
select is((pg_temp.month_of('b4444444-4444-4444-8444-444444444441', '2026-11-01')).transaction_id,
  (select id from paid_early), 'the month points at the payment');
select is((pg_temp.month_of('b4444444-4444-4444-8444-444444444441', '2026-11-01')).paid_at,
  '2026-10-28T09:00:00Z'::timestamptz, 'paid at the time of the payment');
select is((select count(*)::int from public.bill_months where bill_id = 'b5555555-5555-4555-8555-555555555551'), 0,
  'another user''s bill with the same payee is not touched');

select pg_temp.pay('TEST LANDLORD', 1250000, '2026-11-30T18:00:00Z', 'sms', 'fee');
select pg_temp.pay('TEST LANDLORD', 1250000, '2026-11-30T18:00:00Z', 'manual');
select pg_temp.pay('TEST LANDLORD', 2000000, '2026-11-30T18:00:00Z');
select is(pg_temp.month_of('b4444444-4444-4444-8444-444444444441', '2026-12-01'), null::public.bill_months,
  'fee rows, manual rows and amounts far off the bill pay nothing');

create temp table paid_dec as
  select pg_temp.pay('Test Landlord', 1200000, '2026-11-30T18:00:00Z') as id;
select is((pg_temp.month_of('b4444444-4444-4444-8444-444444444441', '2026-12-01')).status, 'paid',
  'a second payment pays the next month owed (December), within the amount rule');

-- ---- skipped months, distance, one bill per payment ------------------------------------------------------
insert into public.bill_months (user_id, bill_id, month, due_on, amount_cents, status)
  values ('44444444-4444-4444-8444-444444444444', 'b4444444-4444-4444-8444-444444444442', '2026-11-01', '2026-11-20',
          200000, 'skipped');
select is(public.match_bill_payment(pg_temp.pay('DEMO GYM', 200000, '2026-11-19T09:00:00Z')), null::uuid,
  'a skipped month is not paid, and October and December are too far from 19 Nov');
select is((pg_temp.month_of('b4444444-4444-4444-8444-444444444442', '2026-11-01')).status, 'skipped',
  'the skipped month stays skipped');

select pg_temp.pay('DEMO TV LTD', 150000, '2026-11-15T09:00:00Z');
select is((select count(*)::int from public.bill_months
            where bill_id in ('b4444444-4444-4444-8444-444444444443', 'b4444444-4444-4444-8444-444444444444')
              and status = 'paid'), 1, 'one payment pays one bill, even when two bills match');
select is(public.match_bill_payment((select transaction_id from public.bill_months
                                      where bill_id in ('b4444444-4444-4444-8444-444444444443',
                                                        'b4444444-4444-4444-8444-444444444444')
                                        and status = 'paid')), null::uuid,
  'matching the same payment again does nothing');

-- ---- a bill added after it was paid ----------------------------------------------------------------------
select pg_temp.pay('DEMO FIBRE', 350000, now() - interval '2 days');
insert into public.bills (id, user_id, name, amount_cents, due_day, payee_match) values
  ('b4444444-4444-4444-8444-444444444445', '44444444-4444-4444-8444-444444444444', 'Internet', 350000,
   extract(day from now() at time zone 'Africa/Nairobi')::int, 'demo fibre');
select is((select count(*)::int from public.bill_months
            where bill_id = 'b4444444-4444-4444-8444-444444444445' and status = 'paid'), 1,
  'a bill added after its payment came in is marked paid');

-- ---- not undone by mistake -------------------------------------------------------------------------------
-- The rest runs as Dana, through row-level security, as the app would.
grant select on paid_early, paid_dec to authenticated;
create function pg_temp.as_dana() returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
$$;
select pg_temp.as_dana();
set local role authenticated;

select throws_ok(
  $$ update public.bill_months set status = 'due', paid_at = null, transaction_id = null
      where bill_id = 'b4444444-4444-4444-8444-444444444441' and month = '2026-11-01' $$,
  'P0001', null, 'an SMS-paid month cannot be set back to due by an ordinary update');
select throws_ok(
  $$ update public.bill_months set status = 'skipped', paid_at = null, transaction_id = null
      where bill_id = 'b4444444-4444-4444-8444-444444444441' and month = '2026-11-01' $$,
  'P0001', null, 'nor skipped');

insert into public.bill_months (bill_id, month, due_on, amount_cents, status, paid_at)
  values ('b4444444-4444-4444-8444-444444444442', '2026-12-01', '2026-12-20', 200000, 'paid', now());
select lives_ok(
  $$ update public.bill_months set status = 'due', paid_at = null
      where bill_id = 'b4444444-4444-4444-8444-444444444442' and month = '2026-12-01' $$,
  'a month marked paid by hand can still be undone');

select lives_ok($$ select public.unmatch_bill_payment(
  (select id from public.bill_months where bill_id = 'b4444444-4444-4444-8444-444444444441' and month = '2026-11-01')) $$,
  'unmatch_bill_payment sets an SMS-paid month back on purpose');
select is((pg_temp.month_of('b4444444-4444-4444-8444-444444444441', '2026-11-01')).status, 'due', 'it is due again');
select is((select count(*)::int from public.transactions where id = (select id from paid_early) and deleted_at is null), 1,
  'the payment itself is kept');
select throws_ok(
  $$ update public.bill_months set status = 'due', paid_at = null, transaction_id = null
      where bill_id = 'b4444444-4444-4444-8444-444444444441' and month = '2026-12-01' $$,
  'P0001', null, 'the guard is back on after unmatching');

update public.transactions set deleted_at = now(), deleted_reason = 'test: duplicate'
 where id = (select id from paid_dec);
select is((pg_temp.month_of('b4444444-4444-4444-8444-444444444441', '2026-12-01')).status, 'due',
  'deleting the payment sets its month back to due');

reset role;
select ok(not has_function_privilege('anon', 'public.unmatch_bill_payment(uuid)', 'execute'),
  'anon cannot call unmatch_bill_payment');

select * from finish();
rollback;
