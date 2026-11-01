-- Sheet backup ([1.7]): the run log is the owner's to read and nobody else's; the nightly job is scheduled and
-- does nothing while its Vault secrets are missing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('88888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hal@example.test', '{}', '{}', now(), now()),
  ('99999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ivy@example.test', '{}', '{}', now(), now());

-- As the Edge Function (service role) would.
insert into public.backup_runs (user_id, status, finished_at, rows_written, tabs, error) values
  ('88888888-8888-4888-8888-888888888888', 'ok', now(), 120, '{2025,2026}', null),
  ('88888888-8888-4888-8888-888888888888', 'failed', now(), null, null, 'Google Sheets PUT → 403');

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('88888888-8888-4888-8888-888888888888');
set local role authenticated;
select is((select count(*)::int from public.backup_runs), 2, 'the owner sees their backup runs');
select is((select error from public.backup_runs where status = 'failed'), 'Google Sheets PUT → 403',
  'a failure and its message are visible to the owner (Settings)');
select throws_ok($$ insert into public.backup_runs (status) values ('ok') $$, '42501', null,
  'the app cannot write the log');
reset role;

select pg_temp.sign_in('99999999-9999-4999-8999-999999999999');
set local role authenticated;
select is((select count(*)::int from public.backup_runs), 0, 'another user sees none');
select throws_ok($$ select public.run_sheet_backup() $$, '42501', null, 'signed-in users cannot trigger the job');
reset role;

select is((select schedule from cron.job where jobname = 'sheet-backup'), '30 20 * * *',
  'the job runs nightly at 23:30 Nairobi time');
select is(public.run_sheet_backup(), null::bigint, 'without its Vault secrets the job does nothing');

select * from finish();
rollback;
