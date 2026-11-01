-- counts_in_net defaults by account kind (D-010): everything but long-term debt counts in net position.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'dan@example.test', '{}', '{}', now(), now());

insert into public.accounts (user_id, name, kind, debt_term)
select '44444444-4444-4444-8444-444444444444', v.name, v.kind, v.term
from (values ('wallet', 'wallet', null), ('bank', 'bank', null), ('cash', 'cash', null),
             ('savings', 'savings', null), ('short loan', 'loan', 'short'), ('long loan', 'loan', 'long'))
  as v(name, kind, term);

select ok((select counts_in_net from public.accounts where name = 'wallet'), 'wallets count');
select ok((select counts_in_net from public.accounts where name = 'bank'), 'bank accounts count');
select ok((select counts_in_net from public.accounts where name = 'cash'), 'cash counts');
select ok((select counts_in_net from public.accounts where name = 'savings'), 'savings count');
select ok((select counts_in_net from public.accounts where name = 'short loan'), 'short-term debt counts (it is negative)');
select ok(not (select counts_in_net from public.accounts where name = 'long loan'), 'long-term debt is shown separately');

select * from finish();
rollback;
