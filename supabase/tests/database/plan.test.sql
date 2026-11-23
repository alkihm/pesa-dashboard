-- My plan (#156): plans and plan_items rules, owner-only access, and the two new notify kinds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'frank@example.test', '{}', '{}', now(), now()),
  ('77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'grace@example.test', '{}', '{}', now(), now());

insert into public.accounts (id, user_id, name, kind)
values ('66666666-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666666', 'Rainy day', 'savings');

-- plans
select lives_ok(
  $$insert into public.plans (user_id, why, saving_target_cents, payday)
    values ('66666666-6666-4666-8666-666666666666', 'Clear the loans, then build.', 1000000, 25)$$,
  'a plan with a why, a saving target and a payday');
select throws_ok(
  $$insert into public.plans (user_id) values ('66666666-6666-4666-8666-666666666666')$$,
  '23505', null, 'one plan per user');
select throws_ok(
  $$insert into public.plans (user_id, payday) values ('77777777-7777-4777-8777-777777777777', 32)$$,
  '23514', null, 'payday is a day of the month');
select is(
  (select started_on from public.plans where user_id = '66666666-6666-4666-8666-666666666666'),
  (now() at time zone 'Africa/Nairobi')::date, 'the plan starts today, Nairobi time');

-- plan_items
select lives_ok(
  $$insert into public.plan_items (user_id, kind, title, target_on, track, target_cents, from_cents)
    values ('66666666-6666-4666-8666-666666666666', 'milestone', 'Short-term debt cleared', '2027-01-31', 'short_debt', 0, 5000000)$$,
  'a milestone tracking short-term debt');
select lives_ok(
  $$insert into public.plan_items (user_id, kind, title, target_on, track, account_id, target_cents, headline)
    values ('66666666-6666-4666-8666-666666666666', 'milestone', 'Rainy-day fund', '2027-03-31', 'account',
            '66666666-0000-4000-8000-000000000001', 5000000, true)$$,
  'a headline milestone tracking an account');
select lives_ok(
  $$insert into public.plan_items (user_id, kind, emoji, title)
    values ('66666666-6666-4666-8666-666666666666', 'rule', '🚫', 'No new mobile loans')$$,
  'a rule');
select throws_ok(
  $$insert into public.plan_items (user_id, kind, title, target_on)
    values ('66666666-6666-4666-8666-666666666666', 'rule', 'Not a milestone', '2027-01-01')$$,
  '23514', null, 'a rule has no date');
select throws_ok(
  $$insert into public.plan_items (user_id, kind, title, track)
    values ('66666666-6666-4666-8666-666666666666', 'milestone', 'No target', 'short_debt')$$,
  '23514', null, 'a tracked milestone needs a target');
select throws_ok(
  $$insert into public.plan_items (user_id, kind, title, target_cents)
    values ('66666666-6666-4666-8666-666666666666', 'milestone', 'Manual with target', 100)$$,
  '23514', null, 'a manual milestone has no target');
select throws_ok(
  $$insert into public.plan_items (user_id, kind, title, headline)
    values ('66666666-6666-4666-8666-666666666666', 'milestone', 'Second headline', true)$$,
  '23505', null, 'only one headline milestone');

-- Deleting the account keeps the milestone.
delete from public.accounts where id = '66666666-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.plan_items where title = 'Rainy-day fund' and account_id is null), 1,
  'a milestone outlives its account');

-- Row-level security: another user sees none of it.
set local role authenticated;
set local request.jwt.claims to '{"sub": "77777777-7777-4777-8777-777777777777", "role": "authenticated"}';
select is((select count(*)::int from public.plans) + (select count(*)::int from public.plan_items), 0,
          'another user sees no plan and no items');
reset role;

-- notify can log the new kinds.
select lives_ok(
  $$insert into public.notification_log (user_id, kind, ref, title)
    values ('66666666-6666-4666-8666-666666666666', 'plan_payday', 'payday:2026-12', 'Payday'),
           ('66666666-6666-4666-8666-666666666666', 'plan_milestone', 'reached:x', 'Milestone')$$,
  'notification_log accepts plan_payday and plan_milestone');

select * from finish();
rollback;
