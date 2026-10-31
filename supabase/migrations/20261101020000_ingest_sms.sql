-- ingest_sms: writes one received SMS and the rows planned for it (src/lib/intake/plan.ts) in one database
-- transaction, so a message and its transfer legs land together or not at all. Called only by the intake
-- function with the service role.

create function public.ingest_sms(
  p_user_id uuid,
  p_sender text,
  p_body text,
  p_received_at timestamptz,
  p_hash text,
  p_status text,
  p_error text,
  p_parser_version text,
  p_rows jsonb default '[]'::jsonb,
  p_snapshots jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_sms uuid;
  v_groups jsonb := '{}'::jsonb;
  v_ids jsonb := '{}'::jsonb;
  v_tid uuid;
  v_id uuid;
  v_claim uuid;
  v_added integer := 0;
  v_skipped integer := 0;
  v_claimed integer := 0;
  r record;
begin
  insert into sms_messages (user_id, sender, body, received_at, hash, parse_status, parser_version, error)
  values (p_user_id, p_sender, p_body, p_received_at, p_hash, p_status, p_parser_version, p_error)
  on conflict (user_id, hash) do nothing
  returning id into v_sms;

  if v_sms is null then
    return jsonb_build_object('result', 'duplicate');
  end if;
  if p_status <> 'parsed' then
    return jsonb_build_object('result', p_status, 'sms_id', v_sms);
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      key text, account_id uuid, amount_cents bigint, kind text, category_id uuid, transfer_group text,
      peer_account_id uuid, parent_key text, payee text, channel text, ref text, dedupe_key text,
      occurred_at timestamptz, needs_review boolean, original_currency text, original_minor bigint)
  loop
    -- The same payment reported by another message (a second sender, a bank's copy) is already recorded.
    if exists (select 1 from transactions t where t.user_id = p_user_id and t.dedupe_key = r.dedupe_key) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if r.peer_account_id is not null then
      -- A transfer named by a payee rule. If the other side's SMS came first, it left this leg waiting
      -- (flagged, dedupe key ending ':peer'); claim it instead of creating a second pair.
      select t.id into v_claim
        from transactions t
       where t.user_id = p_user_id and t.account_id = r.account_id and t.amount_cents = r.amount_cents
         and t.kind = 'transfer' and t.needs_review and t.deleted_at is null and t.dedupe_key like '%:peer'
         and t.occurred_at between r.occurred_at - interval '3 days' and r.occurred_at + interval '3 days'
         and exists (select 1 from transactions o
                      where o.transfer_id = t.transfer_id and o.id <> t.id and o.account_id = r.peer_account_id)
       order by abs(extract(epoch from t.occurred_at - r.occurred_at))
       limit 1
       for update;

      if v_claim is not null then
        update transactions
           set sms_id = v_sms, ref = r.ref, dedupe_key = r.dedupe_key, occurred_at = r.occurred_at,
               payee = coalesce(r.payee, payee), channel = r.channel, needs_review = coalesce(r.needs_review, false)
         where id = v_claim;
        v_ids := v_ids || jsonb_build_object(r.key, v_claim);
        v_claimed := v_claimed + 1;
        v_claim := null;
        continue;
      end if;

      v_tid := gen_random_uuid();
      insert into transactions (user_id, occurred_at, account_id, amount_cents, kind, transfer_id, payee, channel,
                                source, sms_id, ref, dedupe_key, needs_review)
      values (p_user_id, r.occurred_at, r.peer_account_id, -r.amount_cents, 'transfer', v_tid, null, r.channel,
              'sms', v_sms, r.ref, r.dedupe_key || ':peer', true);
    elsif r.transfer_group is not null then
      if not v_groups ? r.transfer_group then
        v_groups := v_groups || jsonb_build_object(r.transfer_group, gen_random_uuid());
      end if;
      v_tid := (v_groups ->> r.transfer_group)::uuid;
    else
      v_tid := null;
    end if;

    insert into transactions (user_id, occurred_at, account_id, amount_cents, kind, category_id, transfer_id,
                              parent_id, payee, channel, source, sms_id, ref, dedupe_key, needs_review,
                              original_currency, original_minor)
    values (p_user_id, r.occurred_at, r.account_id, r.amount_cents, r.kind, r.category_id, v_tid,
            (v_ids ->> r.parent_key)::uuid, r.payee, r.channel, 'sms', v_sms, r.ref, r.dedupe_key,
            coalesce(r.needs_review, false), r.original_currency, r.original_minor)
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(r.key, v_id);
    v_added := v_added + 1;
  end loop;

  insert into balance_snapshots (user_id, account_id, balance_cents, as_of, source, sms_id)
  select p_user_id, s.account_id, s.balance_cents, s.as_of, 'sms', v_sms
    from jsonb_to_recordset(p_snapshots) as s(account_id uuid, balance_cents bigint, as_of timestamptz)
  on conflict (sms_id, account_id) do nothing;

  return jsonb_build_object('result', 'parsed', 'sms_id', v_sms,
                            'added', v_added, 'skipped', v_skipped, 'claimed', v_claimed);
end;
$$;

revoke execute on function public.ingest_sms from public, anon, authenticated;
grant execute on function public.ingest_sms to service_role;

comment on function public.ingest_sms is
  'Intake only (service role). Duplicate SMS by hash → no-op; duplicate payment by dedupe_key → row skipped.';
