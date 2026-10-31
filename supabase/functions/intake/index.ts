// SMS intake (ARCHITECTURE "Flow" step 2). The iPhone Shortcut posts each money SMS here with the intake key.
// Parsing and planning live in src/lib (unit-tested) and run here from the copies in ../_shared/lib
// (scripts/sync-functions.mjs); this file wires them to the database.
//
// Env: INTAKE_KEY (the Shortcut's key), INTAKE_USER_ID (the owner), plus SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY, which Supabase provides.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { readPayload, sameKey, smsHash } from "../_shared/lib/intake/payload.ts";
import { planIngest, type Lookups } from "../_shared/lib/intake/plan.ts";
import { isOneTimeCode, parseSms } from "../_shared/lib/sms/index.ts";

const PARSER_VERSION = "1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const expected = Deno.env.get("INTAKE_KEY") ?? "";
  const userId = Deno.env.get("INTAKE_USER_ID") ?? "";
  if (!expected || !userId) return json({ ok: false, error: "intake not configured" }, 500);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }

  const request = readPayload(body, req.headers.get("x-intake-key"), new Date());
  if (!sameKey(request.key, expected)) return json({ ok: false, error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  if (request.action === "status") return json(await status(db, userId));

  const [accounts, rules, categories] = await Promise.all([
    db.from("accounts").select("id, kind, sms_account_hint, archived_at").eq("user_id", userId),
    db
      .from("payee_rules")
      .select("pattern, priority, category_id, transfer_account_id")
      .eq("user_id", userId),
    db.from("categories").select("id, name, kind, system").eq("user_id", userId),
  ]);
  const failed = accounts.error ?? rules.error ?? categories.error;
  if (failed) return json({ ok: false, error: failed.message }, 500);
  const lookups: Lookups = { accounts: accounts.data, rules: rules.data, categories: categories.data };

  const counts = {
    received: request.messages.length,
    added: 0,
    duplicates: 0,
    review: 0,
    ignored: 0,
    skipped: 0,
  };
  for (const m of request.messages) {
    if (isOneTimeCode(m.body)) {
      counts.skipped++; // never stored
      continue;
    }
    const plan = planIngest(parseSms({ sender: m.sender, body: m.body, receivedAt: m.receivedAt }), lookups);
    const hash = await smsHash(m.sender, m.body);
    const args = {
      p_user_id: userId,
      p_sender: m.sender,
      p_body: m.body,
      p_received_at: m.receivedAt.toISOString(),
      p_hash: hash,
      p_parser_version: PARSER_VERSION,
    };

    let { data, error } = await db.rpc("ingest_sms", {
      ...args,
      p_status: plan.status,
      p_error: plan.error,
      p_rows: plan.rows,
      p_snapshots: plan.snapshots,
    });
    if (error) {
      // The rows could not be written (e.g. half of a transfer already recorded). Keep the SMS for review.
      ({ data, error } = await db.rpc("ingest_sms", {
        ...args,
        p_status: "to_review",
        p_error: error.message,
      }));
      if (error) return json({ ok: false, error: error.message, ...counts }, 500);
    }

    const { result, added = 0, claimed = 0 } = data as { result: string; added?: number; claimed?: number };
    // A new message whose payment was already recorded from another sender adds nothing: a duplicate too.
    if (result === "duplicate" || (result === "parsed" && added + claimed === 0 && plan.rows.length > 0)) {
      counts.duplicates++;
    } else if (result === "parsed") counts.added++;
    else if (result === "to_review") counts.review++;
    else counts.ignored++;
  }

  return json({ ok: true, ...counts });
});

// What the phone shows after a send: how much has arrived and what needs a look.
async function status(db: SupabaseClient, userId: string) {
  const sms = () =>
    db.from("sms_messages").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const [all, review, last] = await Promise.all([
    sms(),
    sms().eq("parse_status", "to_review"),
    db
      .from("sms_messages")
      .select("received_at")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(1),
  ]);
  return {
    ok: true,
    received: all.count ?? 0,
    review: review.count ?? 0,
    last: last.data?.[0]?.received_at ?? null,
  };
}
