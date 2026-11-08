-- [4.4] Notifications. Every 15 minutes pg_cron calls the notify Edge Function, which works out the alerts that are
-- due (src/lib/notify/rules.ts), skips any already sent and pushes the rest to the owner's devices. No-op until the
-- Vault secrets notify_url and notify_key exist (same pattern as the sheet backup, D-013).

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('review_due', 'mismatch', 'bill_tomorrow', 'bill_overdue', 'big_spend', 'weekly_summary', 'test')),
  ref text not null,
  title text not null,
  sent_at timestamptz not null default now(),
  devices integer not null default 0 check (devices >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint notification_log_once unique (user_id, kind, ref)
);

comment on table public.notification_log is
  'One row per notification sent: (user, kind, ref) is unique, so the same alert never goes out twice.';

create index notification_log_user_sent on public.notification_log (user_id, sent_at desc);

alter table public.notification_log enable row level security;

-- The owner can read what was sent; only the notify function (service role) writes.
create policy notification_log_owner_read on public.notification_log
  for select to authenticated using (user_id = (select auth.uid()));

create trigger notification_log_touch before update on public.notification_log
  for each row execute function public.touch_row();

create function public.run_notifications() returns bigint
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_key');
begin
  if v_url is null or v_key is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-notify-key', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.run_notifications from public, anon, authenticated;

comment on function public.run_notifications is
  'Called every 15 minutes by pg_cron. Posts to the notify Edge Function; no-op until the Vault secrets exist.';

select cron.schedule('notify', '*/15 * * * *', 'select public.run_notifications()');
