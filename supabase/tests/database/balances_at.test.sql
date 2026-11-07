-- account_balances_at ([4.8]): each account's ledger at a past moment, only the caller's own.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'fay@example.test', '{}', '{}', now(), now()),
  ('77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'gus@example.test', '{}', '{}', now(), now());

insert into public.accounts (id, user_id, name, kind, debt_term, sort_order) values
  ('a6666666-6666-4666-8666-666666666661', '66666666-6666-4666-8666-666666666666', 'Wallet', 'wallet', null, 1),
  ('a6666666-6666-4666-8666-666666666662', '66666666-6666-4666-8666-666666666666', 'Overdraft', 'loan', 'short', 2),
  ('a7777777-7777-4777-8777-777777777771', '77777777-7777-4777-8777-777777777777', 'Other wallet', 'wallet', null, 1);

insert into public.transactions (user_id, occurred_at, account_id, amount_cents, kind, source, deleted_at, deleted_reason) values
  ('66666666-6666-4666-8666-666666666666', '2026-09-30 23:00+03', 'a6666666-6666-4666-8666-666666666661', 100000, 'opening',  'manual', null, null),
  ('66666666-6666-4666-8666-666666666666', '2026-10-31 23:59+03', 'a6666666-6666-4666-8666-666666666661', -30000, 'spending', 'manual', null, null),
  -- the first moment of November: after the October month end
  ('66666666-6666-4666-8666-666666666666', '2026-11-01 00:00+03', 'a6666666-6666-4666-8666-666666666661', -20000, 'spending', 'manual', null, null),
  -- deleted: counts nowhere
  ('66666666-6666-4666-8666-666666666666', '2026-10-15 09:00+03', 'a6666666-6666-4666-8666-666666666661', -99900, 'spending', 'manual', now(), 'duplicate'),
  ('66666666-6666-4666-8666-666666666666', '2026-10-10 09:00+03', 'a6666666-6666-4666-8666-666666666662', -45000, 'opening',  'manual', null, null),
  ('77777777-7777-4777-8777-777777777777', '2026-10-10 09:00+03', 'a7777777-7777-4777-8777-777777777771', 55500, 'opening',  'manual', null, null);

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('66666666-6666-4666-8666-666666666666');
set local role authenticated;

select is(
  (select balance_cents from public.account_balances_at('2026-11-01 00:00+03') where name = 'Wallet'),
  70000::bigint,
  'October month end: rows before 1 Nov 00:00, the deleted row left out');
select is(
  (select balance_cents from public.account_balances_at('2026-12-01 00:00+03') where name = 'Wallet'),
  50000::bigint,
  'a later moment includes November');
select is(
  (select count(*) from public.account_balances_at('2026-10-01 00:00+03') where name = 'Overdraft'),
  0::bigint,
  'an account opened later, with nothing before the moment, is left out');
select is(
  (select debt_term from public.account_balances_at('2026-11-01 00:00+03') where name = 'Overdraft'),
  'short',
  'the fields summarise() needs are there');
select is(
  (select count(*) from public.account_balances_at('2026-11-01 00:00+03') where name = 'Other wallet'),
  0::bigint,
  'another owner''s accounts are not visible');
select is(
  (select count(*) from public.account_balances_at('2026-11-01 00:00+03')),
  2::bigint,
  'only the caller''s two accounts');

reset role;
select ok(
  not has_function_privilege('anon', 'public.account_balances_at(timestamptz)', 'execute'),
  'anon cannot call it');

select * from finish();
rollback;
