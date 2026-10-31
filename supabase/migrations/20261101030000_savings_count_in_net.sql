-- Savings count in net position by default (D-010): net position = wallets, bank, cash and savings minus
-- short-term debt. Only the default for new accounts changes; existing rows keep what they have.

create or replace function public.accounts_defaults() returns trigger
language plpgsql as $$
begin
  if new.counts_in_net is null then
    new.counts_in_net := new.kind in ('wallet', 'bank', 'cash', 'savings') or coalesce(new.debt_term = 'short', false);
  end if;
  return new;
end;
$$;
