-- [4.9] part B: settings.currency / month_start_day and the budget month in the totals views. Invented data; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- budget_month: calendar months at day 1; a later start day moves the first days into the month before.
select is(public.budget_month('2026-11-01 00:00', 1), '2026-11-01'::date, 'day 1: the 1st opens its month');
select is(public.budget_month('2026-11-24 23:59', 25), '2026-10-01'::date, 'day 25: the 24th belongs to the month before');
select is(public.budget_month('2026-11-25 00:00', 25), '2026-11-01'::date, 'day 25: the 25th opens the month');
select is(public.budget_month('2026-12-31 12:00', 25), '2026-12-01'::date, 'day 25: the 31st stays in its month');
select is(public.budget_month('2026-03-01 08:00', null), '2026-03-01'::date, 'no setting: calendar month');

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('88888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'hana@example.test', '{}', '{}', now(), now());
insert into public.accounts (id, user_id, name, kind)
values ('a8888888-8888-4888-8888-888888888881', '88888888-8888-4888-8888-888888888888', 'Wallet', 'wallet');
-- 24 Nov 22:00 Nairobi = 19:00 UTC; 25 Nov 09:00 Nairobi = 06:00 UTC.
insert into public.transactions (user_id, account_id, amount_cents, occurred_at, kind, source) values
  ('88888888-8888-4888-8888-888888888888', 'a8888888-8888-4888-8888-888888888881', -1000, '2026-11-24 19:00+00', 'spending', 'manual'),
  ('88888888-8888-4888-8888-888888888888', 'a8888888-8888-4888-8888-888888888881', -2000, '2026-11-25 06:00+00', 'spending', 'manual');

select results_eq(
  $$ select month, spending_cents from public.month_totals
     where user_id = '88888888-8888-4888-8888-888888888888' order by month $$,
  $$ values ('2026-11-01'::date, 3000::bigint) $$,
  'without settings both fall in November'
);

insert into public.settings (user_id, month_start_day) values ('88888888-8888-4888-8888-888888888888', 25);

select results_eq(
  $$ select month, spending_cents from public.month_totals
     where user_id = '88888888-8888-4888-8888-888888888888' order by month $$,
  $$ values ('2026-10-01'::date, 1000::bigint), ('2026-11-01'::date, 2000::bigint) $$,
  'start day 25 splits them at 25 Nov 00:00 Nairobi'
);

select results_eq(
  $$ select month, total_cents from public.category_month_totals
     where user_id = '88888888-8888-4888-8888-888888888888' order by month $$,
  $$ values ('2026-10-01'::date, 1000::bigint), ('2026-11-01'::date, 2000::bigint) $$,
  'category totals follow the same months'
);

select throws_ok(
  $$ update public.settings set month_start_day = 29 where user_id = '88888888-8888-4888-8888-888888888888' $$,
  '23514', null, 'the start day is 1 to 28'
);

select throws_ok(
  $$ update public.settings set currency = 'XYZ' where user_id = '88888888-8888-4888-8888-888888888888' $$,
  '23514', null, 'only listed currencies'
);

select * from finish();
rollback;
