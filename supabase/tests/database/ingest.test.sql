-- ingest_sms: only the service role may call it; repeat messages and repeat payments write nothing new.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'carol@example.test', '{}', '{}', now(), now());
insert into public.accounts (id, user_id, name, kind, debt_term, sms_account_hint) values
  ('a3333333-3333-4333-8333-333333333331', '33333333-3333-4333-8333-333333333333', 'Wallet', 'wallet', null, 'mpesa'),
  ('a3333333-3333-4333-8333-333333333332', '33333333-3333-4333-8333-333333333333', 'Overdraft', 'loan', 'short', 'fuliza');

select ok(not has_function_privilege('anon', 'public.ingest_sms(uuid,text,text,timestamptz,text,text,text,text,jsonb,jsonb)', 'execute'),
  'anon cannot call ingest_sms');
select ok(not has_function_privilege('authenticated', 'public.ingest_sms(uuid,text,text,timestamptz,text,text,text,text,jsonb,jsonb)', 'execute'),
  'signed-in users cannot call ingest_sms');
select ok(has_function_privilege('service_role', 'public.ingest_sms(uuid,text,text,timestamptz,text,text,text,text,jsonb,jsonb)', 'execute'),
  'the service role can call ingest_sms');

-- A Fuliza draw: two transfer legs in one group, plus a balance reading.
create temp table draw as select $$[
  {"key":"fuliza-draw-out","account_id":"a3333333-3333-4333-8333-333333333332","amount_cents":-70000,"kind":"transfer",
   "transfer_group":"fuliza-draw","channel":"loan","ref":"TSD4E5F6G7","dedupe_key":"mpesa:TSD4E5F6G7:fuliza-draw-out",
   "occurred_at":"2026-01-05T08:00:00Z","needs_review":false},
  {"key":"fuliza-draw-in","account_id":"a3333333-3333-4333-8333-333333333331","amount_cents":70000,"kind":"transfer",
   "transfer_group":"fuliza-draw","channel":"loan","ref":"TSD4E5F6G7","dedupe_key":"mpesa:TSD4E5F6G7:fuliza-draw-in",
   "occurred_at":"2026-01-05T08:00:00Z","needs_review":false}
]$$::jsonb as rows;

select is(
  public.ingest_sms('33333333-3333-4333-8333-333333333333', 'MPESA', 'draw text', now(), 'hash-1', 'parsed', null, 't',
    (select rows from draw),
    '[{"account_id":"a3333333-3333-4333-8333-333333333332","balance_cents":-70700,"as_of":"2026-01-05T08:00:00Z"}]')
    ->> 'added', '2', 'a transfer group is written as two rows');

select is((select count(distinct transfer_id)::int from public.transactions where ref = 'TSD4E5F6G7'), 1,
  'both legs share one transfer id');
select is((select balance_cents from public.balance_snapshots
            where account_id = 'a3333333-3333-4333-8333-333333333332'), -70700::bigint, 'the balance reading is stored');

select is(
  public.ingest_sms('33333333-3333-4333-8333-333333333333', 'MPESA', 'draw text', now(), 'hash-1', 'parsed', null, 't',
    (select rows from draw)) ->> 'result', 'duplicate', 'the same message again is a no-op');

select is(
  public.ingest_sms('33333333-3333-4333-8333-333333333333', 'OTHER', 'draw text from another sender', now(), 'hash-2',
    'parsed', null, 't', (select rows from draw)) ->> 'skipped', '2',
  'the same payment from another message is skipped by dedupe key');

select is((select count(*)::int from public.transactions where ref = 'TSD4E5F6G7'), 2, 'still only two rows');

select * from finish();
rollback;
