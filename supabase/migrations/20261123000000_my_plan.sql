-- #156 My plan: the owner's money plan, kept in view on Home and on /plan, with reminders from notify.
--
-- plans       one row per user: the "why" line, the monthly saving target (for the saving streak and the payday
--             nudge), payday (day of the month for the nudge) and the day the plan started.
-- plan_items  milestones and rules. A milestone has a target date and is tracked one of three ways:
--               manual      ticked by hand (done_at)
--               account     an account reaching target_cents: a savings/everyday balance at least the target, or a
--                           loan/card owing at most the target
--               short_debt  total short-term debt owing at most target_cents
--             from_cents is the starting figure, for the progress bar. One milestone can be the headline (the big
--             countdown on /plan). A rule is a short note: emoji and title only.
--
-- notification_log accepts the two new notify kinds: plan_payday and plan_milestone.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  why text check (why is null or length(why) <= 280),
  saving_target_cents bigint check (saving_target_cents is null or saving_target_cents > 0),
  payday smallint check (payday between 1 and 31),
  started_on date not null default (now() at time zone 'Africa/Nairobi')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint plans_one_per_user unique (user_id)
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('milestone', 'rule')),
  title text not null check (length(trim(title)) between 1 and 200),
  emoji text,
  target_on date,
  track text not null default 'manual' check (track in ('manual', 'account', 'short_debt')),
  account_id uuid references public.accounts (id) on delete set null,
  target_cents bigint check (target_cents is null or target_cents >= 0),
  from_cents bigint check (from_cents is null or from_cents >= 0),
  done_at timestamptz,
  headline boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  -- A rule is just a note.
  constraint plan_items_rule_is_note check (
    kind = 'milestone'
    or (target_on is null and track = 'manual' and account_id is null and target_cents is null
        and from_cents is null and done_at is null and not headline)
  ),
  -- A tracked milestone says what it tracks and the figure it aims for; a manual one has neither.
  -- (An account milestone whose account is deleted keeps its target and falls back to manual on screen.)
  constraint plan_items_track_target check (
    (track = 'manual' and account_id is null and target_cents is null)
    or (track = 'account' and target_cents is not null)
    or (track = 'short_debt' and account_id is null and target_cents is not null)
  )
);

create index plan_items_user_idx on public.plan_items (user_id, kind, sort_order);
create unique index plan_items_one_headline on public.plan_items (user_id) where headline and archived_at is null;

alter table public.plans enable row level security;
alter table public.plan_items enable row level security;

create policy owner_all on public.plans for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy owner_all on public.plan_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger touch_row before update on public.plans
  for each row execute function public.touch_row();
create trigger touch_row before update on public.plan_items
  for each row execute function public.touch_row();

comment on table public.plans is 'My plan (#156): one per user — why, monthly saving target, payday, start date.';
comment on table public.plan_items is 'My plan (#156): milestones (manual, account or short_debt tracked) and rules.';

alter table public.notification_log drop constraint notification_log_kind_check;

alter table public.notification_log add constraint notification_log_kind_check check (
  kind in (
    'review_due', 'mismatch', 'bill_tomorrow', 'bill_overdue', 'big_spend', 'weekly_summary',
    'intake_quiet', 'parse_failures', 'plan_payday', 'plan_milestone', 'test'
  )
);
