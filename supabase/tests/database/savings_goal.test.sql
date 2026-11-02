-- Savings goal and lock date ([2.9]): savings accounts only, a goal above zero, and both shown in account_balances.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'eve@example.test', '{}', '{}', now(), now());

insert into public.accounts (user_id, name, kind, goal_cents, locked_until)
values ('55555555-5555-4555-8555-555555555555', 'Sacco', 'savings', 10000000, '2027-06-30');

select is((select goal_cents from public.account_balances where name = 'Sacco' and user_id = '55555555-5555-4555-8555-555555555555'), 10000000::bigint,
          'the view shows the goal');
select is((select locked_until from public.account_balances where name = 'Sacco' and user_id = '55555555-5555-4555-8555-555555555555'), '2027-06-30'::date,
          'the view shows the lock date');

select lives_ok(
  $$insert into public.accounts (user_id, name, kind) values ('55555555-5555-4555-8555-555555555555', 'Plain savings', 'savings')$$,
  'a savings account needs neither');
select throws_ok(
  $$insert into public.accounts (user_id, name, kind, goal_cents) values ('55555555-5555-4555-8555-555555555555', 'Wallet', 'wallet', 100)$$,
  '23514', null, 'only savings accounts have a goal');
select throws_ok(
  $$insert into public.accounts (user_id, name, kind, locked_until) values ('55555555-5555-4555-8555-555555555555', 'Bank', 'bank', '2027-01-01')$$,
  '23514', null, 'only savings accounts have a lock date');
select throws_ok(
  $$insert into public.accounts (user_id, name, kind, goal_cents) values ('55555555-5555-4555-8555-555555555555', 'Zero', 'savings', 0)$$,
  '23514', null, 'a goal is above zero');

select * from finish();
rollback;
