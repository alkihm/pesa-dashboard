-- apply_payee_rule: a rule created later recategorises past rows, or turns them into transfers ([1.9]).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'fay@example.test', '{}', '{}', now(), now()),
  ('77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'gus@example.test', '{}', '{}', now(), now());

create function pg_temp.sign_in(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('66666666-6666-4666-8666-666666666666');
set local role authenticated;

insert into public.accounts (id, name, kind) values
  ('a6666666-6666-4666-8666-666666666661', 'Wallet', 'wallet'),
  ('a6666666-6666-4666-8666-666666666662', 'Bank', 'bank');
insert into public.categories (id, name, colour, kind) values
  ('c6666666-6666-4666-8666-666666666661', 'Groceries', 'cat-1', 'spending'),
  ('c6666666-6666-4666-8666-666666666662', 'Eating out', 'cat-3', 'spending'),
  ('c6666666-6666-4666-8666-666666666663', 'Other income', 'cat-10', 'income');

insert into public.transactions (id, occurred_at, account_id, amount_cents, kind, category_id, payee, source, needs_review,
                                 original_currency, original_minor, deleted_at, deleted_reason) values
  ('e6666666-6666-4666-8666-666666666661', now(), 'a6666666-6666-4666-8666-666666666661', -10000, 'spending', null, 'DEMO MART FEDHA', 'manual', true, null, null, null, null),
  ('e6666666-6666-4666-8666-666666666662', now(), 'a6666666-6666-4666-8666-666666666661', -20000, 'spending', null, 'demo mart westside', 'manual', true, null, null, null, null),
  ('e6666666-6666-4666-8666-666666666663', now(), 'a6666666-6666-4666-8666-666666666661', -30000, 'spending', 'c6666666-6666-4666-8666-666666666662', 'DEMO MART CAFE', 'manual', false, null, null, null, null),
  ('e6666666-6666-4666-8666-666666666664', now(), 'a6666666-6666-4666-8666-666666666661',  40000, 'income',   null, 'DEMO MART REFUND', 'manual', true, null, null, null, null),
  ('e6666666-6666-4666-8666-666666666665', now(), 'a6666666-6666-4666-8666-666666666661', -50000, 'spending', null, 'DEMO MART ONLINE', 'manual', true, 'USD', 300, null, null),
  ('e6666666-6666-4666-8666-666666666666', now(), 'a6666666-6666-4666-8666-666666666661', -60000, 'spending', null, 'DEMO MART OLD', 'manual', true, null, null, now(), 'duplicate'),
  ('e6666666-6666-4666-8666-666666666667', now(), 'a6666666-6666-4666-8666-666666666661', -70000, 'spending', null, 'FAY SELF 0700000111', 'manual', true, null, null, null, null);

insert into public.payee_rules (id, pattern, priority, category_id, transfer_account_id) values
  ('b6666666-6666-4666-8666-666666666661', 'demo mart', 10, 'c6666666-6666-4666-8666-666666666661', null),
  ('b6666666-6666-4666-8666-666666666662', 'FAY SELF', 5, null, 'a6666666-6666-4666-8666-666666666662');

-- ---- category rule --------------------------------------------------------------------------------------
select is(public.apply_payee_rule('b6666666-6666-4666-8666-666666666661', false, true), 3,
  'dry run counts uncategorised spending rows that match, ignoring case');
select is((select count(*)::int from public.transactions where category_id = 'c6666666-6666-4666-8666-666666666661'), 0,
  'dry run changes nothing');

select is(public.apply_payee_rule('b6666666-6666-4666-8666-666666666661'), 3, 'apply changes the same three rows');
select is((select count(*)::int from public.transactions where category_id = 'c6666666-6666-4666-8666-666666666661'), 3,
  'they now have the rule''s category');
select is((select count(*)::int from public.transactions
            where category_id = 'c6666666-6666-4666-8666-666666666661' and not needs_review), 2,
  'review is cleared on the two KES rows');
select ok((select needs_review from public.transactions where id = 'e6666666-6666-4666-8666-666666666665'),
  'a foreign-currency estimate stays in review');
select is((select category_id from public.transactions where id = 'e6666666-6666-4666-8666-666666666663'),
  'c6666666-6666-4666-8666-666666666662'::uuid, 'an already categorised row is left alone by default');
select ok((select category_id is null from public.transactions where id = 'e6666666-6666-4666-8666-666666666664'),
  'income rows are not given a spending category');
select ok((select category_id is null from public.transactions where id = 'e6666666-6666-4666-8666-666666666666'),
  'deleted rows are not touched');

select is(public.apply_payee_rule('b6666666-6666-4666-8666-666666666661', true), 1,
  'overwrite also replaces another category');

-- ---- transfer rule --------------------------------------------------------------------------------------
select is(public.apply_payee_rule('b6666666-6666-4666-8666-666666666662'), 1, 'a transfer rule converts the matching row');
select is(
  (select string_agg(a.name || ' ' || t.amount_cents || ' ' || t.needs_review, ', ' order by t.amount_cents)
     from public.transactions t join public.accounts a on a.id = t.account_id
    where t.transfer_id = (select transfer_id from public.transactions where id = 'e6666666-6666-4666-8666-666666666667')),
  'Wallet -70000 true, Bank 70000 true',
  'the row becomes one leg and the other leg is created on the rule''s account, flagged');
select lives_ok($$ set constraints all immediate $$, 'the new transfer passes the balanced-transfer check');

reset role;

-- ---- another user, anonymous ----------------------------------------------------------------------------
select pg_temp.sign_in('77777777-7777-4777-8777-777777777777');
set local role authenticated;
select throws_ok($$ select public.apply_payee_rule('b6666666-6666-4666-8666-666666666661') $$, 'P0002', null,
  'another user cannot apply someone else''s rule');
reset role;

set local role anon;
select throws_ok($$ select public.apply_payee_rule('b6666666-6666-4666-8666-666666666661') $$, '42501', null,
  'anon cannot call apply_payee_rule');
reset role;

select * from finish();
rollback;
