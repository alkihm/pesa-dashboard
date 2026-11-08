-- [4.4] notification_log: owner read only, one row per (user, kind, ref); the 15-minute job. Invented data; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('99999999-9999-4999-8999-999999999991', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ivy@example.test', '{}', '{}', now(), now()),
  ('99999999-9999-4999-8999-999999999992', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'jon@example.test', '{}', '{}', now(), now());

-- The notify function writes with the service role.
insert into public.notification_log (user_id, kind, ref, title)
values ('99999999-9999-4999-8999-999999999991', 'bill_tomorrow', 'tomorrow:m1', 'Rent is due tomorrow');

select throws_ok(
  $$ insert into public.notification_log (user_id, kind, ref, title)
     values ('99999999-9999-4999-8999-999999999991', 'bill_tomorrow', 'tomorrow:m1', 'again') $$,
  '23505', null, 'the same notice cannot be logged twice'
);

select throws_ok(
  $$ insert into public.notification_log (user_id, kind, ref, title)
     values ('99999999-9999-4999-8999-999999999991', 'nonsense', 'x', 'x') $$,
  '23514', null, 'only known kinds'
);

-- [5.5] The intake monitoring alerts.
select lives_ok(
  $$ insert into public.notification_log (user_id, kind, ref, title)
     values ('99999999-9999-4999-8999-999999999992', 'intake_quiet', 'quiet:2026-11-08T05:00:00Z', 'No SMS'),
            ('99999999-9999-4999-8999-999999999992', 'parse_failures', 'parse:2026-11-08', 'SMS not read') $$,
  'intake_quiet and parse_failures can be logged'
);
delete from public.notification_log where user_id = '99999999-9999-4999-8999-999999999992';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "99999999-9999-4999-8999-999999999991", "role": "authenticated"}', true);
select is((select count(*) from public.notification_log)::int, 1, 'the owner sees what was sent to them');
select throws_ok(
  $$ insert into public.notification_log (kind, ref, title) values ('test', 'x', 'x') $$,
  '42501', null, 'the app cannot write the log'
);

select set_config('request.jwt.claims', '{"sub": "99999999-9999-4999-8999-999999999992", "role": "authenticated"}', true);
select is((select count(*) from public.notification_log)::int, 0, 'nobody else sees it');
reset role;

select is(
  (select schedule from cron.job where jobname = 'notify'), '*/15 * * * *', 'the notify job runs every 15 minutes'
);

select ok(
  not has_function_privilege('authenticated', 'public.run_notifications()', 'execute'),
  'the app cannot trigger a run'
);

select * from finish();
rollback;
