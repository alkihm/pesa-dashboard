-- Row-level security: another user sees and changes nothing; anonymous requests are refused.
-- Run with `supabase test db`. Everything happens in one transaction and is rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Two invented users. Alice owns data; Bob owns nothing.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.test', '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@example.test', '{}', '{}', now(), now());

-- Sets the JWT claims auth.uid() reads; each block then switches to the authenticated role.
create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ---- every table is covered -------------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0,
  'row-level security is on for every public table');

select is(
  (select count(*)::int from pg_tables t
    where t.schemaname = 'public' and t.tablename <> 'pin_credentials'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)), 0,
  'every public table except pin_credentials has a policy');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'pin_credentials'), 0,
  'pin_credentials has no policy');

select is(
  (select count(*)::int from pg_views v join pg_class c on c.relname = v.viewname
    where v.schemaname = 'public' and not coalesce('security_invoker=true' = any (c.reloptions), false)), 0,
  'every public view runs as the caller');

-- ---- Alice writes her own data ----------------------------------------------------------------------------
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111');
set local role authenticated;

insert into public.accounts (id, name, kind) values
  ('a1111111-1111-4111-8111-111111111111', 'Alice wallet', 'wallet'),
  ('a1111111-1111-4111-8111-111111111112', 'Alice bank', 'bank');
insert into public.categories (id, name, colour, kind) values
  ('c1111111-1111-4111-8111-111111111111', 'Food', 'cat-1', 'spending');
insert into public.transactions (occurred_at, account_id, amount_cents, kind, category_id, source)
  values (now(), 'a1111111-1111-4111-8111-111111111111', -50000, 'spending', 'c1111111-1111-4111-8111-111111111111', 'manual');
insert into public.transactions (occurred_at, account_id, amount_cents, kind, transfer_id, source) values
  (now(), 'a1111111-1111-4111-8111-111111111112', -10000, 'transfer', 'f1111111-1111-4111-8111-111111111111', 'manual'),
  (now(), 'a1111111-1111-4111-8111-111111111111',  10000, 'transfer', 'f1111111-1111-4111-8111-111111111111', 'manual');
insert into public.bills (id, name, amount_cents, due_day) values
  ('b1111111-1111-4111-8111-111111111111', 'Rent', 100000, 5);
insert into public.settings default values;
select count(*) from public.ensure_bill_months('2026-11-01');

select is((select count(*)::int from public.accounts), 2, 'Alice sees her accounts');
select is((select count(*)::int from public.transactions), 3, 'Alice sees her transactions');
select is((select balance_cents from public.account_balances where name = 'Alice wallet'), -40000::bigint,
  'Alice sees her balance through the view');
select is((select count(*)::int from public.bill_months), 1, 'ensure_bill_months works for Alice');
select is((select user_id from public.settings), '11111111-1111-4111-8111-111111111111'::uuid,
  'user_id defaults to the signed-in user');

reset role;

-- ---- Bob sees nothing of Alice's --------------------------------------------------------------------------
select pg_temp.sign_in('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select is((select count(*)::int from public.accounts), 0, 'Bob sees no accounts');
select is((select count(*)::int from public.categories), 0, 'Bob sees no categories');
select is((select count(*)::int from public.transactions), 0, 'Bob sees no transactions');
select is((select count(*)::int from public.bills), 0, 'Bob sees no bills');
select is((select count(*)::int from public.bill_months), 0, 'Bob sees no bill months');
select is((select count(*)::int from public.settings), 0, 'Bob sees no settings');
select is((select count(*)::int from public.account_balances), 0, 'Bob sees no balances');
select is((select count(*)::int from public.month_totals), 0, 'Bob sees no month totals');
select is((select count(*)::int from public.category_month_totals), 0, 'Bob sees no category totals');
select is((select count(*)::int from public.ensure_bill_months('2026-11-01')), 0,
  'ensure_bill_months makes nothing from Alice''s bills for Bob');

update public.accounts set name = 'taken' where id = 'a1111111-1111-4111-8111-111111111111';
delete from public.transactions;

select throws_ok(
  $$ insert into public.accounts (user_id, name, kind)
     values ('11111111-1111-4111-8111-111111111111', 'planted', 'cash') $$,
  '42501', null, 'Bob cannot write a row owned by Alice');

select throws_ok(
  $$ select * from public.pin_credentials $$,
  '42501', null, 'pin_credentials cannot be read by a signed-in user');

reset role;

select pg_temp.sign_in('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select is((select name from public.accounts where id = 'a1111111-1111-4111-8111-111111111111'), 'Alice wallet',
  'Bob''s update changed nothing');
select is((select count(*)::int from public.transactions), 3, 'Bob''s delete removed nothing');
reset role;

-- ---- anonymous requests are refused -----------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.accounts $$, '42501', null, 'anon cannot read accounts');
select throws_ok($$ select * from public.transactions $$, '42501', null, 'anon cannot read transactions');
select throws_ok($$ select * from public.account_balances $$, '42501', null, 'anon cannot read balances');
select throws_ok($$ insert into public.sms_messages (sender, body, received_at, hash, parse_status)
                    values ('x', 'y', now(), 'z', 'parsed') $$, '42501', null, 'anon cannot write SMS');
select throws_ok($$ select public.ensure_bill_months('2026-11-01') $$, '42501', null,
  'anon cannot call ensure_bill_months');
reset role;

select * from finish();
rollback;
