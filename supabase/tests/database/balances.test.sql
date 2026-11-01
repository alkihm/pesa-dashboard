-- account_balances: the ledger balance, the latest reading, and the difference at the reading's time ([1.8]).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'erin@example.test', '{}', '{}', now(), now());
insert into public.accounts (id, user_id, name, emoji, kind, sort_order) values
  ('a5555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555555', 'Wallet', '📱', 'wallet', 3);

insert into public.transactions (user_id, occurred_at, account_id, amount_cents, kind, source, deleted_at, deleted_reason) values
  ('55555555-5555-4555-8555-555555555555', '2026-10-01 08:00+03', 'a5555555-5555-4555-8555-555555555551', 100000, 'opening',  'manual', null, null),
  ('55555555-5555-4555-8555-555555555555', '2026-10-02 08:00+03', 'a5555555-5555-4555-8555-555555555551', -30000, 'spending', 'manual', null, null),
  -- after the reading: in the balance, not in the comparison
  ('55555555-5555-4555-8555-555555555555', '2026-10-03 08:00+03', 'a5555555-5555-4555-8555-555555555551', -20000, 'spending', 'manual', null, null),
  -- deleted: counts nowhere
  ('55555555-5555-4555-8555-555555555555', '2026-10-02 09:00+03', 'a5555555-5555-4555-8555-555555555551', -99900, 'spending', 'manual', now(), 'duplicate');

-- An older reading that disagreed, then a newer one that agrees with the ledger at its time.
insert into public.balance_snapshots (user_id, account_id, balance_cents, as_of, source) values
  ('55555555-5555-4555-8555-555555555555', 'a5555555-5555-4555-8555-555555555551', 12345, '2026-10-01 09:00+03', 'manual'),
  ('55555555-5555-4555-8555-555555555555', 'a5555555-5555-4555-8555-555555555551', 70000, '2026-10-02 08:00+03', 'manual');

create temp view w as select * from public.account_balances where account_id = 'a5555555-5555-4555-8555-555555555551';

select is((select balance_cents from w), 50000::bigint, 'balance = sum of live transactions (deleted row left out)');
select is((select snapshot_cents from w), 70000::bigint, 'the latest reading is used');
select is((select difference_cents from w), 0::bigint,
  'difference compares the ledger up to the reading''s time (a later spend does not count)');
select is((select snapshot_source from w), 'manual', 'the reading''s source is exposed');
select is((select emoji || ' ' || sort_order from w), '📱 3', 'emoji and sort order are exposed');

insert into public.balance_snapshots (user_id, account_id, balance_cents, as_of, source) values
  ('55555555-5555-4555-8555-555555555555', 'a5555555-5555-4555-8555-555555555551', 49000, '2026-10-03 08:00+03', 'manual');
select is((select difference_cents from w), -1000::bigint, 'a reading KES 10 below the ledger shows −1000 cents');

update public.accounts set archived_at = now() where id = 'a5555555-5555-4555-8555-555555555551';
select ok((select archived_at is not null from w), 'archived accounts stay in the view, marked');

insert into public.accounts (id, user_id, name, kind) values
  ('a5555555-5555-4555-8555-555555555552', '55555555-5555-4555-8555-555555555555', 'New savings', 'savings');
select ok(
  (select snapshot_at is null and difference_cents is null and balance_cents = 0
     from public.account_balances where account_id = 'a5555555-5555-4555-8555-555555555552'),
  'an account with no reading has no difference and a zero balance');

select * from finish();
rollback;
