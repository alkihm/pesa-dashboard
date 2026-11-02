-- PIN unlock ([2.1]): the hash stays out of reach, 5 wrong tries lock it, a recent sign-in resets it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('88888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hal@example.test', '{}', '{}', now(), now()),
  ('99999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ivy@example.test', '{}', '{}', now(), now());

-- signed_in_at goes into the token's amr claim, as Supabase does at sign-in.
create function pg_temp.sign_in(uid uuid, signed_in_at timestamptz) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
    'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from signed_in_at)::bigint)))::text, true);
$$;

-- ---- access ---------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.verify_pin(text)', 'execute'), 'anon cannot verify a PIN');
select ok(not has_function_privilege('anon', 'public.set_pin(text)', 'execute'), 'anon cannot set a PIN');
select ok(not has_function_privilege('authenticated', 'public.pin_recent_sign_in()', 'execute'),
  'the helper is not callable on its own');

-- Signed in a day ago: an old session on this device.
select pg_temp.sign_in('88888888-8888-4888-8888-888888888888', now() - interval '1 day');
set local role authenticated;

select throws_ok($$ select * from public.pin_credentials $$, '42501', null, 'the app cannot read pin_credentials');
select is((public.pin_status()).has_pin, false, 'no PIN yet');
select is((public.pin_status()).recent_sign_in, false, 'a day-old sign-in is not recent');

-- ---- set ------------------------------------------------------------------------------------------------
select throws_ok($$ select public.set_pin('12345') $$, '22023', null, 'five digits are refused');
select throws_ok($$ select public.set_pin('12345a') $$, '22023', null, 'letters are refused');
select lives_ok($$ select public.set_pin('135790') $$, 'the first PIN needs only a session');
select is((public.pin_status()).has_pin, true, 'now there is a PIN');

reset role;
select ok((select pin_hash like '$2a$10$%' and pin_hash not like '%135790%' from public.pin_credentials
            where user_id = '88888888-8888-4888-8888-888888888888'), 'it is stored as a bcrypt hash');
set local role authenticated;

select throws_ok($$ select public.set_pin('246801') $$, '42501', null,
  'changing it needs a recent sign-in');

-- ---- verify ---------------------------------------------------------------------------------------------
select is(public.verify_pin('135790'), (true, 5, null)::public.pin_check, 'the right PIN unlocks');
select is(public.verify_pin('000000'), (false, 4, null)::public.pin_check, 'a wrong PIN leaves 4 tries');
select is(public.verify_pin('000000'), (false, 3, null)::public.pin_check, 'another leaves 3');
select is(public.verify_pin('135790'), (true, 5, null)::public.pin_check, 'the right PIN resets the count');
select is((public.pin_status()).tries_left, 5, 'status shows 5 tries again');

select public.verify_pin('000000') from generate_series(1, 4);
select is(public.verify_pin('000000'), (false, 0, now() + interval '15 minutes')::public.pin_check,
  'the fifth wrong PIN locks it for 15 minutes');
select is(public.verify_pin('135790'), (false, 0, now() + interval '15 minutes')::public.pin_check,
  'while locked, even the right PIN is refused');
select is(public.pin_status(), (true, 0, now() + interval '15 minutes', false)::public.pin_state,
  'status shows the lock');

-- ---- reset by signing in again -----------------------------------------------------------------------------
reset role;
select pg_temp.sign_in('88888888-8888-4888-8888-888888888888', now() - interval '1 minute');
set local role authenticated;

select lives_ok($$ select public.set_pin('246801') $$, 'a fresh sign-in can set a new PIN while locked');
select is(public.pin_status(), (true, 5, null, true)::public.pin_state, 'which clears the lock');
select is((public.verify_pin('246801')).ok, true, 'the new PIN unlocks');

-- ---- one user's PIN is theirs alone ---------------------------------------------------------------------
reset role;
select pg_temp.sign_in('99999999-9999-4999-8999-999999999999', now() - interval '1 day');
set local role authenticated;

select is((public.pin_status()).has_pin, false, 'another user has no PIN of their own yet');

select * from finish();
rollback;
