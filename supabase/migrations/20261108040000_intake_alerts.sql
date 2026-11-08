-- [5.5] Monitoring: two new notify alerts about SMS intake (src/lib/notify/rules.ts). `intake_quiet` fires when no
-- SMS arrived for 8 daytime hours (07:00–22:00 Nairobi), `parse_failures` when at least 3 SMS, and at least 30 %, of
-- the last day's were left to review. Only the kinds notification_log accepts change; the notify function and its
-- 15-minute pg_cron job stay as they are.

alter table public.notification_log drop constraint notification_log_kind_check;

alter table public.notification_log add constraint notification_log_kind_check check (
  kind in (
    'review_due', 'mismatch', 'bill_tomorrow', 'bill_overdue', 'big_spend', 'weekly_summary',
    'intake_quiet', 'parse_failures', 'test'
  )
);
