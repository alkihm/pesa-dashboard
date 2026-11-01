-- Invented sample data for local development. Every name, number and code is made up.
-- `supabase db reset` loads this after the migrations. Runs as postgres, so row-level security does not apply.
--
-- Sign in locally as sample@example.test / sample-password-1 (email sign-in is local only).
-- October 2026 adds up: M-PESA ends at KES 936, KCB at KES 111,500, cash is KES 100 short of its last count.

-- ---- owner -------------------------------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'sample@example.test', crypt('sample-password-1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into public.settings (user_id, review_interval_days, loan_allocation_pct)
values ('00000000-0000-4000-8000-000000000001', 3, 30);

-- ---- accounts ----------------------------------------------------------------------------------------------
insert into public.accounts (id, user_id, name, emoji, kind, debt_term, sms_sender, sms_account_hint, limit_cents, original_cents, due_day, sort_order)
select v.id::uuid, '00000000-0000-4000-8000-000000000001', v.name, v.emoji, v.kind, v.debt_term, v.sender, v.hint, v.lim, v.orig, v.due, v.sort
from (values
  ('a0000000-0000-4000-8000-000000000001', 'M-PESA',   '📱', 'wallet',  null,    'MPESA', 'mpesa',       null::bigint, null::bigint, null::smallint, 1),
  ('a0000000-0000-4000-8000-000000000002', 'KCB',      '🏦', 'bank',    null,    'KCB',   'KCB',        null,         null,         null,           2),
  ('a0000000-0000-4000-8000-000000000003', 'Cash',     '💵', 'cash',    null,    null,    null,         null,         null,         null,           3),
  ('a0000000-0000-4000-8000-000000000004', 'Sacco',    '🐷', 'savings', null,    null,    null,         null,         null,         null,           4),
  ('a0000000-0000-4000-8000-000000000005', 'M-Shwari', '💰', 'savings', null,    'MPESA', 'mshwari',    null,         null,         null,           5),
  ('a0000000-0000-4000-8000-000000000006', 'Fuliza',   '⚡', 'loan',    'short', 'MPESA', 'fuliza',     500000,       null,         null,           6),
  ('a0000000-0000-4000-8000-000000000007', 'Car loan', '🚗', 'loan',    'long',  null,    null,         null,         80000000,     20,             7)
) as v(id, name, emoji, kind, debt_term, sender, hint, lim, orig, due, sort);

-- ---- categories --------------------------------------------------------------------------------------------
insert into public.categories (id, user_id, name, emoji, colour, kind, monthly_budget_cents, system, sort_order)
select v.id::uuid, '00000000-0000-4000-8000-000000000001', v.name, v.emoji, v.colour, v.kind, v.budget, v.sys, v.sort
from (values
  ('c0000000-0000-4000-8000-000000000001', 'Groceries',        '🛒', 'cat-1',  'spending', 2000000::bigint, false, 1),
  ('c0000000-0000-4000-8000-000000000002', 'Fuel',             '⛽', 'cat-2',  'spending', 1200000,         false, 2),
  ('c0000000-0000-4000-8000-000000000003', 'Eating out',       '🍽️', 'cat-3',  'spending', 600000,          false, 3),
  ('c0000000-0000-4000-8000-000000000004', 'Rent',             '🏠', 'cat-4',  'spending', null,            false, 4),
  ('c0000000-0000-4000-8000-000000000005', 'Utilities',        '💡', 'cat-5',  'spending', null,            false, 5),
  ('c0000000-0000-4000-8000-000000000006', 'Subscriptions',    '📺', 'cat-6',  'spending', null,            false, 6),
  ('c0000000-0000-4000-8000-000000000007', 'Transport',        '🚌', 'cat-7',  'spending', 500000,          false, 7),
  ('c0000000-0000-4000-8000-000000000008', 'Transaction fees', '🧾', 'cat-8',  'spending', null,            true,  8),
  ('c0000000-0000-4000-8000-000000000009', 'Salary',           '💼', 'cat-9',  'income',   null,            false, 9),
  ('c0000000-0000-4000-8000-000000000010', 'Other income',     '🎁', 'cat-10', 'income',   null,            false, 10),
  ('c0000000-0000-4000-8000-000000000011', 'Uncategorised',    '❓', 'cat-12', 'spending', null,            true,  11)
) as v(id, name, emoji, colour, kind, budget, sys, sort);

insert into public.payee_rules (user_id, pattern, priority, category_id, transfer_account_id) values
  ('00000000-0000-4000-8000-000000000001', 'DEMO MART',     10, 'c0000000-0000-4000-8000-000000000001', null),
  ('00000000-0000-4000-8000-000000000001', 'DEMO FUEL',     10, 'c0000000-0000-4000-8000-000000000002', null),
  ('00000000-0000-4000-8000-000000000001', 'TEST LANDLORD', 10, 'c0000000-0000-4000-8000-000000000004', null),
  ('00000000-0000-4000-8000-000000000001', 'SAMPLE SACCO',  10, null, 'a0000000-0000-4000-8000-000000000004');

-- ---- SMS as received ---------------------------------------------------------------------------------------
insert into public.sms_messages (id, user_id, sender, body, received_at, hash, parse_status, parser_version)
select v.id::uuid, '00000000-0000-4000-8000-000000000001', 'MPESA', v.body, v.at::timestamptz,
       encode(sha256(convert_to('MPESA|' || v.body, 'UTF8')), 'hex'), 'parsed', 'seed'
from (values
  ('d0000000-0000-4000-8000-000000000001', '2026-10-02 18:00+03',
   'SDA1B2C3D4 Confirmed. Ksh3,500.00 paid to DEMO MART. on 2/10/26 at 6:00 PM.New M-PESA balance is Ksh21,500.00. Transaction cost, Ksh0.00.'),
  ('d0000000-0000-4000-8000-000000000002', '2026-10-05 09:00+03',
   'SDB2C3D4E5 Confirmed. Ksh18,000.00 sent to TEST LANDLORD for account FLAT2 on 5/10/26 at 9:00 AM New M-PESA balance is Ksh0.00. Transaction cost, Ksh108.00.'),
  ('d0000000-0000-4000-8000-000000000003', '2026-10-05 09:01+03',
   'SDB2C3D4E5 Confirmed. Fuliza M-PESA amount is Ksh 608.00. Access Fee charged Ksh 6.00. Total Fuliza M-PESA outstanding amount is Ksh614.00 due on 04/11/26.'),
  ('d0000000-0000-4000-8000-000000000004', '2026-10-12 13:30+03',
   'SDC3D4E5F6 Confirmed. Ksh450.00 paid to SAMPLE CAFE. on 12/10/26 at 1:30 PM.New M-PESA balance is Ksh936.00. Transaction cost, Ksh0.00.')
) as v(id, at, body);

-- ---- transactions ------------------------------------------------------------------------------------------
-- Columns: id, time, account, cents, kind, category, transfer, parent, payee, channel, reason, source, sms, ref, dedupe
insert into public.transactions (id, user_id, occurred_at, account_id, amount_cents, kind, category_id, transfer_id, parent_id, payee, channel, reason, source, sms_id, ref, dedupe_key)
select v.id::uuid, '00000000-0000-4000-8000-000000000001', v.at::timestamptz, v.acct::uuid, v.cents, v.kind,
       v.cat::uuid, v.xfer::uuid, v.parent::uuid, v.payee, v.channel, v.reason, v.source, v.sms::uuid, v.ref, v.dedupe
from (values
  -- opening balances, 1 October
  ('e0000000-0000-4000-8000-000000000001', '2026-10-01 00:00+03', 'a0000000-0000-4000-8000-000000000001',    500000::bigint, 'opening', null, null, null, null, null, null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000002', '2026-10-01 00:00+03', 'a0000000-0000-4000-8000-000000000002',   1000000, 'opening', null, null, null, null, null, null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000003', '2026-10-01 00:00+03', 'a0000000-0000-4000-8000-000000000003',    200000, 'opening', null, null, null, null, null, null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000004', '2026-10-01 00:00+03', 'a0000000-0000-4000-8000-000000000004',   5000000, 'opening', null, null, null, null, null, null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000005', '2026-10-01 00:00+03', 'a0000000-0000-4000-8000-000000000007', -60000000, 'opening', null, null, null, null, null, null, 'manual', null, null, null),
  -- salary into KCB, then KES 20,000 moved to M-PESA
  ('e0000000-0000-4000-8000-000000000010', '2026-10-01 08:00+03', 'a0000000-0000-4000-8000-000000000002',  15000000, 'income',   'c0000000-0000-4000-8000-000000000009', null, null, 'SAMPLE EMPLOYER LTD', 'deposit', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000011', '2026-10-01 09:00+03', 'a0000000-0000-4000-8000-000000000002',  -2000000, 'transfer', null, 'f0000000-0000-4000-8000-000000000001', null, 'M-PESA', 'send', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000012', '2026-10-01 09:00+03', 'a0000000-0000-4000-8000-000000000001',   2000000, 'transfer', null, 'f0000000-0000-4000-8000-000000000001', null, 'KCB', 'receive', null, 'manual', null, null, null),
  -- groceries and fuel
  ('e0000000-0000-4000-8000-000000000020', '2026-10-02 18:00+03', 'a0000000-0000-4000-8000-000000000001',   -350000, 'spending', 'c0000000-0000-4000-8000-000000000001', null, null, 'DEMO MART', 'till', null, 'sms', 'd0000000-0000-4000-8000-000000000001', 'SDA1B2C3D4', 'mpesa:SDA1B2C3D4:main'),
  ('e0000000-0000-4000-8000-000000000021', '2026-10-03 08:00+03', 'a0000000-0000-4000-8000-000000000001',   -400000, 'spending', 'c0000000-0000-4000-8000-000000000002', null, null, 'DEMO FUEL STATION', 'till', null, 'manual', null, null, null),
  -- rent: Fuliza covers the shortfall, the paybill fee and the Fuliza fee are their own rows
  ('e0000000-0000-4000-8000-000000000030', '2026-10-05 09:00+03', 'a0000000-0000-4000-8000-000000000006',    -60800, 'transfer', null, 'f0000000-0000-4000-8000-000000000002', null, 'Fuliza', 'loan', null, 'sms', 'd0000000-0000-4000-8000-000000000003', 'SDB2C3D4E5', 'mpesa:SDB2C3D4E5:fuliza-draw-out'),
  ('e0000000-0000-4000-8000-000000000031', '2026-10-05 09:00+03', 'a0000000-0000-4000-8000-000000000001',     60800, 'transfer', null, 'f0000000-0000-4000-8000-000000000002', null, 'Fuliza', 'loan', null, 'sms', 'd0000000-0000-4000-8000-000000000003', 'SDB2C3D4E5', 'mpesa:SDB2C3D4E5:fuliza-draw-in'),
  ('e0000000-0000-4000-8000-000000000032', '2026-10-05 09:00+03', 'a0000000-0000-4000-8000-000000000006',      -600, 'spending', 'c0000000-0000-4000-8000-000000000008', null, null, 'Fuliza', 'fee', null, 'sms', 'd0000000-0000-4000-8000-000000000003', 'SDB2C3D4E5', 'mpesa:SDB2C3D4E5:fuliza-fee'),
  ('e0000000-0000-4000-8000-000000000033', '2026-10-05 09:00+03', 'a0000000-0000-4000-8000-000000000001',  -1800000, 'spending', 'c0000000-0000-4000-8000-000000000004', null, null, 'TEST LANDLORD', 'paybill', null, 'sms', 'd0000000-0000-4000-8000-000000000002', 'SDB2C3D4E5', 'mpesa:SDB2C3D4E5:main'),
  ('e0000000-0000-4000-8000-000000000034', '2026-10-05 09:00+03', 'a0000000-0000-4000-8000-000000000001',    -10800, 'spending', 'c0000000-0000-4000-8000-000000000008', null, 'e0000000-0000-4000-8000-000000000033', 'TEST LANDLORD', 'fee', null, 'sms', 'd0000000-0000-4000-8000-000000000002', 'SDB2C3D4E5', 'mpesa:SDB2C3D4E5:fee'),
  -- money in, and Fuliza repaid from it
  ('e0000000-0000-4000-8000-000000000040', '2026-10-06 10:00+03', 'a0000000-0000-4000-8000-000000000001',    300000, 'income',   'c0000000-0000-4000-8000-000000000010', null, null, 'SAMPLE FRIEND', 'receive', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000041', '2026-10-06 10:00+03', 'a0000000-0000-4000-8000-000000000001',    -61400, 'transfer', null, 'f0000000-0000-4000-8000-000000000003', null, 'Fuliza', 'loan', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000042', '2026-10-06 10:00+03', 'a0000000-0000-4000-8000-000000000006',     61400, 'transfer', null, 'f0000000-0000-4000-8000-000000000003', null, 'Fuliza', 'loan', null, 'manual', null, null, null),
  -- saving, eating out
  ('e0000000-0000-4000-8000-000000000050', '2026-10-10 12:00+03', 'a0000000-0000-4000-8000-000000000001',   -100000, 'transfer', null, 'f0000000-0000-4000-8000-000000000004', null, 'SAMPLE SACCO', 'paybill', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000051', '2026-10-10 12:00+03', 'a0000000-0000-4000-8000-000000000004',    100000, 'transfer', null, 'f0000000-0000-4000-8000-000000000004', null, 'M-PESA', 'deposit', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000052', '2026-10-12 13:30+03', 'a0000000-0000-4000-8000-000000000001',    -45000, 'spending', 'c0000000-0000-4000-8000-000000000003', null, null, 'SAMPLE CAFE', 'till', null, 'sms', 'd0000000-0000-4000-8000-000000000004', 'SDC3D4E5F6', 'mpesa:SDC3D4E5F6:main'),
  -- internet from KCB, car loan repayment
  ('e0000000-0000-4000-8000-000000000060', '2026-10-15 09:00+03', 'a0000000-0000-4000-8000-000000000002',   -350000, 'spending', 'c0000000-0000-4000-8000-000000000005', null, null, 'DEMO FIBRE', 'card', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000061', '2026-10-20 09:00+03', 'a0000000-0000-4000-8000-000000000002',  -2500000, 'transfer', null, 'f0000000-0000-4000-8000-000000000005', null, 'Car loan', 'loan', null, 'manual', null, null, null),
  ('e0000000-0000-4000-8000-000000000062', '2026-10-20 09:00+03', 'a0000000-0000-4000-8000-000000000007',   2500000, 'transfer', null, 'f0000000-0000-4000-8000-000000000005', null, 'KCB', 'loan', null, 'manual', null, null, null),
  -- cash counted short: an adjustment with a reason (D-007)
  ('e0000000-0000-4000-8000-000000000070', '2026-10-21 20:00+03', 'a0000000-0000-4000-8000-000000000003',    -20000, 'adjustment', null, null, null, null, null, 'Small cash spends not recorded', 'manual', null, null, null)
) as v(id, at, acct, cents, kind, cat, xfer, parent, payee, channel, reason, source, sms, ref, dedupe);

-- ---- balances stated by SMS or counted by hand -------------------------------------------------------------
insert into public.balance_snapshots (user_id, account_id, balance_cents, as_of, source, sms_id) values
  ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',    93600, '2026-10-12 13:30+03', 'sms', 'd0000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',   -61400, '2026-10-05 09:00+03', 'sms', 'd0000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 11150000, '2026-10-20 09:05+03', 'manual', null),
  -- KES 100 less than the ledger: Review shows cash in red
  ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',   170000, '2026-10-25 19:00+03', 'manual', null);

-- ---- bills -------------------------------------------------------------------------------------------------
insert into public.bills (id, user_id, name, emoji, amount_cents, due_day, account_id, category_id, payee_match, starts_on)
select v.id::uuid, '00000000-0000-4000-8000-000000000001', v.name, v.emoji, v.cents, v.due, v.acct::uuid, v.cat::uuid, v.match, '2026-10-01'
from (values
  ('b0000000-0000-4000-8000-000000000001', 'Rent',      '🏠', 1800000::bigint,  5::smallint, 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'TEST LANDLORD'),
  ('b0000000-0000-4000-8000-000000000002', 'Water',     '🚰',   80000,         10,           'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'DEMO WATER'),
  ('b0000000-0000-4000-8000-000000000003', 'Internet',  '🌐',  350000,         15,           'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000005', 'DEMO FIBRE'),
  ('b0000000-0000-4000-8000-000000000004', 'Streaming', '📺',  110000,         31,           'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000006', 'SAMPLE STREAMING')
) as v(id, name, emoji, cents, due, acct, cat, match);

select count(*) from public.ensure_bill_months('2026-10-01');
select count(*) from public.ensure_bill_months('2026-11-01');

update public.bill_months set status = 'paid', paid_at = '2026-10-05 09:00+03', transaction_id = 'e0000000-0000-4000-8000-000000000033'
 where bill_id = 'b0000000-0000-4000-8000-000000000001' and month = '2026-10-01';
update public.bill_months set status = 'paid', paid_at = '2026-10-15 09:00+03', transaction_id = 'e0000000-0000-4000-8000-000000000060'
 where bill_id = 'b0000000-0000-4000-8000-000000000003' and month = '2026-10-01';
update public.bill_months set status = 'skipped', skip_reason = 'Paid in cash to the caretaker'
 where bill_id = 'b0000000-0000-4000-8000-000000000002' and month = '2026-10-01';

-- ---- budget items, a finished review -----------------------------------------------------------------------
insert into public.budget_items (user_id, name, amount_cents, account_id, category_id, month, status, approved_at) values
  ('00000000-0000-4000-8000-000000000001', 'New tyres',    2400000, 'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000007', '2026-11-01', 'approved', '2026-10-28 20:00+03'),
  ('00000000-0000-4000-8000-000000000001', 'Weekend trip', 1500000, 'a0000000-0000-4000-8000-000000000001', null,                                   '2026-11-01', 'pending',  null);

insert into public.reviews (id, user_id, started_at, completed_at, result, note) values
  ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '2026-10-20 21:00+03', '2026-10-20 21:10+03', 'all_match', 'All balances matched.');

insert into public.review_checks (user_id, review_id, account_id, ledger_cents, stated_cents, resolution) values
  ('00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',    93600,    93600, 'matched'),
  ('00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 11150000, 11150000, 'matched');
