-- [4.6] The tables the app follows live are in the supabase_realtime publication (src/lib/live.ts REALTIME_TABLES).
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('transactions', 'sms_messages', 'bill_months', 'accounts') $$,
  array['transactions', 'sms_messages', 'bill_months', 'accounts'],
  'transactions, sms_messages, bill_months and accounts stream to the app'
);

select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('pin_credentials', 'settings')
  ),
  'nothing else is streamed by this migration'
);

select * from finish();
rollback;
