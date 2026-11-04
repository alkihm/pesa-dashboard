-- [3.5] A bill can pay off a loan: the car instalment is a monthly bill whose money goes to the car loan account.
-- The loan repayment slider pays these instalments first (owner's choice, 2026-11-04: link the bill rather than
-- store an instalment on the account). Only loan and card accounts of the same owner can be linked.

alter table public.bills add column loan_account_id uuid references public.accounts (id);

comment on column public.bills.loan_account_id is
  'The loan or card this bill pays off (e.g. a car instalment); null for ordinary bills.';

create function public.bills_loan_account_check() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.loan_account_id is not null and not exists (
    select 1 from accounts a
     where a.id = new.loan_account_id and a.user_id = new.user_id and a.kind in ('loan', 'card')
  ) then
    raise exception 'a bill can only pay off one of its owner''s loan or card accounts' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bills_loan_account_check before insert or update of loan_account_id on public.bills
  for each row execute function public.bills_loan_account_check();
