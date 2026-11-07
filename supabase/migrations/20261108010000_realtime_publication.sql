-- [4.6] Stream changes of the tables the screens show to the app (src/lib/live.ts, REALTIME_TABLES), so a new SMS
-- or a bill an SMS paid appears without a reload. Realtime checks row-level security per subscriber, so each user
-- only receives their own rows. No table changes. Safe to run again: tables already in the publication are skipped.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['transactions', 'sms_messages', 'bill_months', 'accounts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
