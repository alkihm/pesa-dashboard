-- Row-level security policies: each row belongs to one user, and only that user can read or write it.
-- The intake function uses the service role, which bypasses row-level security by design.
-- pin_credentials gets no policy at all (D-009 rule 10).

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'payee_rules', 'sms_messages', 'import_batches', 'bills', 'budget_items',
    'transactions', 'balance_snapshots', 'bill_months', 'reviews', 'review_checks', 'settings',
    'push_subscriptions'
  ] loop
    -- (select auth.uid()) is evaluated once per statement instead of once per row.
    execute format($p$
      create policy owner_all on public.%I for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $p$, t);
  end loop;
end;
$$;

-- Anonymous callers get "permission denied", not just empty results. Tables made by later migrations
-- start the same way.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;
