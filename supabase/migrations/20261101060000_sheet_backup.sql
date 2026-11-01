-- Nightly Google Sheet backup ([1.7]). pg_cron calls the sheet-backup Edge Function every night; the function
-- rewrites one tab per year and logs each run in backup_runs, which Settings shows (D-013).
--
-- The job reads the function URL and key from Vault (secrets sheet_backup_url, sheet_backup_key). Until both
-- exist it does nothing, so local databases and projects without the backup never call anything.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  rows_written integer check (rows_written >= 0),
  tabs text[],
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint backup_runs_finished check ((status = 'running') = (finished_at is null))
);

create index backup_runs_user_idx on public.backup_runs (user_id, started_at desc);

create trigger touch_row before update on public.backup_runs for each row execute function public.touch_row();
alter table public.backup_runs enable row level security;

-- The owner reads the log; only the Edge Function (service role) writes it.
create policy owner_read on public.backup_runs for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.backup_runs from authenticated;

create function public.run_sheet_backup() returns bigint
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'sheet_backup_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'sheet_backup_key');
begin
  if v_url is null or v_key is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-backup-key', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.run_sheet_backup from public, anon, authenticated;

comment on function public.run_sheet_backup is
  'Called nightly by pg_cron. Posts to the sheet-backup Edge Function; no-op until the Vault secrets exist.';

-- 20:30 UTC = 23:30 in Nairobi.
select cron.schedule('sheet-backup', '30 20 * * *', 'select public.run_sheet_backup()');
