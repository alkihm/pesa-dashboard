-- [3.5] bills.loan_account_id: only the owner's loan or card accounts can be linked. Invented data; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'fay@example.test', '{}', '{}', now(), now()),
  ('77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'gus@example.test', '{}', '{}', now(), now());
insert into public.accounts (id, user_id, name, kind, debt_term) values
  ('a6666666-6666-4666-8666-666666666661', '66666666-6666-4666-8666-666666666666', 'Car loan', 'loan', 'long'),
  ('a6666666-6666-4666-8666-666666666662', '66666666-6666-4666-8666-666666666666', 'Wallet', 'wallet', null),
  ('a7777777-7777-4777-8777-777777777771', '77777777-7777-4777-8777-777777777777', 'Other loan', 'loan', 'long');

select lives_ok($$
  insert into public.bills (user_id, name, amount_cents, due_day, loan_account_id)
  values ('66666666-6666-4666-8666-666666666666', 'Car instalment', 3850000, 5, 'a6666666-6666-4666-8666-666666666661')
$$, 'a bill can pay off its owner''s loan');

select throws_ok($$
  insert into public.bills (user_id, name, amount_cents, due_day, loan_account_id)
  values ('66666666-6666-4666-8666-666666666666', 'Not a loan', 100000, 5, 'a6666666-6666-4666-8666-666666666662')
$$, '23514', null, 'a wallet cannot be paid off by a bill');

select throws_ok($$
  insert into public.bills (user_id, name, amount_cents, due_day, loan_account_id)
  values ('66666666-6666-4666-8666-666666666666', 'Someone else', 100000, 5, 'a7777777-7777-4777-8777-777777777771')
$$, '23514', null, 'nor another user''s loan');

select lives_ok($$
  insert into public.bills (user_id, name, amount_cents, due_day)
  values ('66666666-6666-4666-8666-666666666666', 'Rent', 1250000, 1)
$$, 'ordinary bills need no loan');

select * from finish();
rollback;
