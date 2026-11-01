-- apply_payee_rule: applies one payee rule to transactions already recorded ([1.9]). New messages get rules
-- on arrival in the intake (src/lib/intake/plan.ts); this is for a rule created or changed later.
--
-- Matches live spending and income rows whose payee contains the pattern (ignoring case), as the intake
-- does. Past rows keep only the payee, not the paybill account number, so a pattern that matched only the
-- account number on arrival does not match here.
--   category rule: sets the category on rows of the same kind. By default only uncategorised rows;
--                  p_overwrite also replaces other categories. Clears needs_review unless the row is a
--                  foreign-currency estimate, which still needs its statement amount.
--   transfer rule: turns each row into a transfer leg and creates the other leg on the rule's account,
--                  flagged for review, the same as the intake does for a new message.
-- p_dry_run counts the rows it would change and changes nothing. Runs as the caller (row-level security).

create function public.apply_payee_rule(p_rule_id uuid, p_overwrite boolean default false, p_dry_run boolean default false)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  rule payee_rules%rowtype;
  cat_kind text;
  r record;
  n integer := 0;
  v_tid uuid;
begin
  select * into rule from payee_rules where id = p_rule_id;
  if not found then
    raise exception 'payee rule % not found', p_rule_id using errcode = 'P0002';
  end if;

  if rule.category_id is not null then
    select kind into cat_kind from categories where id = rule.category_id;

    if p_dry_run then
      select count(*) into n from transactions t
       where t.user_id = rule.user_id and t.deleted_at is null and t.kind = cat_kind
         and position(upper(trim(rule.pattern)) in upper(coalesce(t.payee, ''))) > 0
         and (t.category_id is null or (p_overwrite and t.category_id <> rule.category_id));
      return n;
    end if;

    update transactions t
       set category_id = rule.category_id,
           needs_review = t.needs_review and t.original_currency is not null
     where t.user_id = rule.user_id and t.deleted_at is null and t.kind = cat_kind
       and position(upper(trim(rule.pattern)) in upper(coalesce(t.payee, ''))) > 0
       and (t.category_id is null or (p_overwrite and t.category_id <> rule.category_id));
    get diagnostics n = row_count;
    return n;
  end if;

  -- Transfer rule.
  for r in
    select t.* from transactions t
     where t.user_id = rule.user_id and t.deleted_at is null and t.kind in ('spending', 'income')
       and t.account_id <> rule.transfer_account_id
       and position(upper(trim(rule.pattern)) in upper(coalesce(t.payee, ''))) > 0
     for update
  loop
    n := n + 1;
    continue when p_dry_run;
    v_tid := gen_random_uuid();
    update transactions set kind = 'transfer', category_id = null, transfer_id = v_tid where id = r.id;
    insert into transactions (user_id, occurred_at, account_id, amount_cents, kind, transfer_id, channel, source,
                              sms_id, ref, dedupe_key, needs_review, note)
    values (r.user_id, r.occurred_at, rule.transfer_account_id, -r.amount_cents, 'transfer', v_tid, r.channel,
            r.source, r.sms_id, r.ref, case when r.dedupe_key is null then null else r.dedupe_key || ':peer' end,
            true, 'Other side of a transfer made by a payee rule');
  end loop;
  return n;
end;
$$;

revoke execute on function public.apply_payee_rule from public, anon;
grant execute on function public.apply_payee_rule to authenticated, service_role;
