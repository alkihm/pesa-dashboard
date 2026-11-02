-- PIN unlock ([2.1]). The PIN hash sits in pin_credentials, which no client can read (D-009 rule 10); these
-- functions are the only way in. They run as the definer and only ever touch the caller's own row.
--
--   pin_status: whether a PIN is set, tries left, the lock, and whether the caller signed in recently.
--   verify_pin: checks a PIN. 5 wrong tries lock it for 15 minutes; the count starts again after the lock.
--               A wrong PIN returns rather than raises, so the count is kept.
--   set_pin:    sets the PIN, 6 digits, stored as a bcrypt hash. The first PIN needs only a session. Changing
--               one needs a sign-in in the last 10 minutes — the reset is signing in with Google again —
--               and clears the count and the lock.
--
-- "Signed in recently" is the newest timestamp in the token's amr claim: when the session was signed in. Token
-- refreshes keep it. The PIN guards the app on a device that already holds a session; it does not limit what
-- that session can do through the API.

create extension if not exists pgcrypto with schema extensions;

create type public.pin_state as (has_pin boolean, tries_left integer, locked_until timestamptz, recent_sign_in boolean);
create type public.pin_check as (ok boolean, tries_left integer, locked_until timestamptz);

create function public.pin_recent_sign_in()
returns boolean
language sql stable set search_path = public as $$
  select coalesce(
    (select max((a ->> 'timestamp')::bigint)
       from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]' end) a)
      >= extract(epoch from now() - interval '10 minutes'),
    false);
$$;

create function public.pin_status()
returns public.pin_state
language plpgsql stable security definer set search_path = public as $$
declare
  c pin_credentials%rowtype;
  locked boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into c from pin_credentials where user_id = auth.uid();
  if not found then
    return (false, 5, null, pin_recent_sign_in())::pin_state;
  end if;
  locked := c.locked_until > now();
  return (true, case when locked then 0 else 5 - c.failed_attempts end,
          case when locked then c.locked_until end, pin_recent_sign_in())::pin_state;
end;
$$;

create function public.verify_pin(p_pin text)
returns public.pin_check
language plpgsql security definer set search_path = public as $$
declare
  c pin_credentials%rowtype;
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'a PIN is 6 digits' using errcode = '22023';
  end if;
  select * into c from pin_credentials where user_id = auth.uid() for update;
  if not found then
    raise exception 'no PIN set' using errcode = 'P0002';
  end if;

  if c.locked_until > now() then
    return (false, 0, c.locked_until)::pin_check;
  end if;

  if extensions.crypt(p_pin, c.pin_hash) = c.pin_hash then
    update pin_credentials set failed_attempts = 0, locked_until = null where id = c.id;
    return (true, 5, null)::pin_check;
  end if;

  n := c.failed_attempts + 1;
  if n >= 5 then
    update pin_credentials set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = c.id;
    return (false, 0, now() + interval '15 minutes')::pin_check;
  end if;
  update pin_credentials set failed_attempts = n, locked_until = null where id = c.id;
  return (false, 5 - n, null)::pin_check;
end;
$$;

create function public.set_pin(p_pin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'a PIN is 6 digits' using errcode = '22023';
  end if;
  if exists (select 1 from pin_credentials where user_id = auth.uid()) and not pin_recent_sign_in() then
    raise exception 'sign in with Google again to change the PIN' using errcode = '42501';
  end if;

  insert into pin_credentials (user_id, pin_hash)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
end;
$$;

revoke execute on function public.pin_recent_sign_in, public.pin_status, public.verify_pin, public.set_pin
  from public, anon;
revoke execute on function public.pin_recent_sign_in from authenticated;
grant execute on function public.pin_status, public.verify_pin, public.set_pin to authenticated;
