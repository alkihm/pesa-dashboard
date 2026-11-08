// [4.4] Notifications. pg_cron posts here every 15 minutes (public.run_notifications) with the notify key: for each
// user with a device subscribed, gather the facts, work out what is due (_shared/lib/notify/rules.ts), drop what
// notification_log already holds, push the rest and log them. Quiet from 22:00 to 07:00 Nairobi time.
// A signed-in user can also post {"test": true} with their own token: one test notification to their devices.
// With the key, {"dryRun": true} lists what would be sent now (ignoring quiet hours) without sending anything.
//
// Env: NOTIFY_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (an https: URL or mailto:), plus SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, which Supabase provides.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";
import { sameKey } from "../_shared/lib/intake/payload.ts";
import { alertsFrom, BIG_SPEND_CENTS } from "../_shared/lib/notify/alerts.ts";
import {
  dueNotices,
  nairobiDate,
  quietHours,
  type Notice,
  type NotifyFacts,
} from "../_shared/lib/notify/rules.ts";

// The app calls this from the browser (Send a test), so the browser's CORS preflight must be answered. Access is
// decided by the key or the user's token, never by cookies, so any origin may ask (Vercel previews change address).
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-notify-key",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const env = (name: string) => Deno.env.get(name) ?? "";

interface Subscription {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Sends one notice to every device; drops subscriptions the push service says are gone. Returns devices reached. */
async function push(
  db: SupabaseClient,
  subs: Subscription[],
  notice: Pick<Notice, "title" | "body" | "url" | "kind" | "ref">,
) {
  let reached = 0;
  const payload = JSON.stringify({
    title: notice.title,
    body: notice.body,
    url: notice.url,
    tag: `${notice.kind}:${notice.ref}`,
  });
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
        TTL: 6 * 60 * 60,
      });
      reached++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
      else console.error("push failed", status, (e as Error).message);
    }
  }
  return reached;
}

async function facts(db: SupabaseClient, userId: string, now: Date): Promise<NotifyFacts> {
  const today = nairobiDate(now);
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [settings, review, balances, bills, spends, week, lastSms, smsDay] = await Promise.all([
    db.from("settings").select("alerts, currency, review_interval_days").eq("user_id", userId).maybeSingle(),
    db
      .from("reviews")
      .select("completed_at")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("account_balances")
      .select("account_id, name, difference_cents, snapshot_at, archived_at")
      .eq("user_id", userId)
      .not("difference_cents", "is", null)
      .neq("difference_cents", 0),
    db
      .from("bill_months")
      .select("id, due_on, amount_cents, bills!inner(name)")
      .eq("user_id", userId)
      .eq("status", "due")
      .lte("due_on", tomorrow),
    db
      .from("transactions")
      .select("id, payee, amount_cents, occurred_at")
      .eq("user_id", userId)
      .eq("kind", "spending")
      .is("deleted_at", null)
      .gte("occurred_at", dayAgo)
      .lte("amount_cents", -BIG_SPEND_CENTS),
    db
      .from("transactions")
      .select("amount_cents")
      .eq("user_id", userId)
      .eq("kind", "spending")
      .is("deleted_at", null)
      .gte("occurred_at", weekAgo),
    // [5.5] Intake monitoring: the newest SMS, and how the last day's SMS were read.
    db
      .from("sms_messages")
      .select("received_at")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("sms_messages")
      .select("parse_status")
      .eq("user_id", userId)
      .in("parse_status", ["parsed", "to_review"])
      .gte("received_at", dayAgo),
  ]);
  const error =
    settings.error ??
    review.error ??
    balances.error ??
    bills.error ??
    spends.error ??
    week.error ??
    lastSms.error ??
    smsDay.error;
  if (error) throw new Error(error.message);

  return {
    now,
    alerts: alertsFrom(settings.data?.alerts),
    currency: settings.data?.currency ?? "KES",
    reviewIntervalDays: settings.data?.review_interval_days ?? 3,
    lastReviewOn: review.data?.completed_at ? nairobiDate(new Date(review.data.completed_at)) : null,
    mismatches: (balances.data ?? [])
      .filter((b) => !b.archived_at)
      .map((b) => ({
        accountId: b.account_id,
        name: b.name,
        differenceCents: b.difference_cents,
        snapshotAt: b.snapshot_at,
      })),
    bills: (bills.data ?? []).map((b) => ({
      id: b.id,
      name: (b.bills as unknown as { name: string }).name,
      dueOn: b.due_on,
      amountCents: b.amount_cents,
    })),
    spends: (spends.data ?? []).map((s) => ({
      id: s.id,
      payee: s.payee,
      amountCents: s.amount_cents,
      occurredAt: s.occurred_at,
    })),
    weekSpendingCents: -(week.data ?? []).reduce((sum, t) => sum + t.amount_cents, 0),
    lastSmsAt: lastSms.data?.received_at ?? null,
    smsDay: {
      parsed: (smsDay.data ?? []).filter((s) => s.parse_status === "parsed").length,
      toReview: (smsDay.data ?? []).filter((s) => s.parse_status === "to_review").length,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!env("VAPID_PUBLIC_KEY") || !env("VAPID_PRIVATE_KEY"))
    return json({ ok: false, error: "push not configured" }, 500);
  webpush.setVapidDetails(
    env("VAPID_SUBJECT") || "https://pesa-dev.autotechfy.com",
    env("VAPID_PUBLIC_KEY"),
    env("VAPID_PRIVATE_KEY"),
  );
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({}));

  // A test from Settings: the caller's own token decides whose devices.
  if (body?.test === true) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    const { data: user, error } = await db.auth.getUser(token);
    if (error || !user.user) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id, endpoint, keys")
      .eq("user_id", user.user.id);
    const ref = new Date().toISOString();
    const notice = {
      kind: "test" as const,
      ref,
      title: "Notifications are on",
      body: "This is how reminders will look.",
      url: "/settings",
    };
    const devices = await push(db, (subs ?? []) as Subscription[], notice as Notice);
    await db
      .from("notification_log")
      .insert({ user_id: user.user.id, kind: "test", ref, title: notice.title, devices });
    return json({ ok: true, devices });
  }

  if (!sameKey(req.headers.get("x-notify-key") ?? undefined, env("NOTIFY_KEY")))
    return json({ ok: false, error: "unauthorized" }, 401);
  const now = new Date();
  // {"dryRun": true}: what would be sent now, ignoring quiet hours; nothing is sent or logged.
  const dryRun = body?.dryRun === true;
  if (!dryRun && quietHours(now)) return json({ ok: true, quiet: true });

  const { data: allSubs, error } = await db.from("push_subscriptions").select("id, user_id, endpoint, keys");
  if (error) return json({ ok: false, error: error.message }, 500);
  const byUser = new Map<string, Subscription[]>();
  for (const s of allSubs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s as Subscription]);

  const sent: { user: string; kind: string; devices: number }[] = [];
  for (const [userId, subs] of byUser) {
    try {
      const due = dueNotices(await facts(db, userId, now));
      if (dryRun) {
        due.forEach((n) => sent.push({ user: userId, kind: `${n.kind} · ${n.title}`, devices: subs.length }));
        continue;
      }
      if (due.length === 0) continue;
      const { data: done } = await db
        .from("notification_log")
        .select("kind, ref")
        .eq("user_id", userId)
        .in(
          "ref",
          due.map((n) => n.ref),
        );
      const already = new Set((done ?? []).map((d) => `${d.kind}|${d.ref}`));
      for (const notice of due.filter((n) => !already.has(`${n.kind}|${n.ref}`))) {
        // Log first: if two runs overlap, the unique key lets only one of them send.
        const { error: logError } = await db
          .from("notification_log")
          .insert({ user_id: userId, kind: notice.kind, ref: notice.ref, title: notice.title });
        if (logError) continue;
        const devices = await push(db, subs, notice);
        await db
          .from("notification_log")
          .update({ devices })
          .eq("user_id", userId)
          .eq("kind", notice.kind)
          .eq("ref", notice.ref);
        sent.push({ user: userId, kind: notice.kind, devices });
      }
    } catch (e) {
      console.error("notify failed for a user", (e as Error).message);
    }
  }
  return json({ ok: true, sent: sent.length, details: sent });
});
