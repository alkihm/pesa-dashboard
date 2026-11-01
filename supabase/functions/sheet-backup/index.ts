// Nightly Google Sheet backup ([1.7], D-013). pg_cron posts here (public.run_sheet_backup) with the backup key.
// Rewrites one tab per year with the whole ledger and logs the run in backup_runs, which Settings shows.
//
// Env: BACKUP_KEY, BACKUP_SHEET_ID, GOOGLE_SERVICE_ACCOUNT (the service account's JSON key, whole),
// OWNER_USER_ID, plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which Supabase provides.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { accessToken, replaceTab, type ServiceAccount } from "../_shared/lib/backup/google.ts";
import { backupTables, type BackupTransaction } from "../_shared/lib/backup/rows.ts";
import { sameKey } from "../_shared/lib/intake/payload.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const env = (name: string) => Deno.env.get(name) ?? "";
  if (!sameKey(req.headers.get("x-backup-key") ?? undefined, env("BACKUP_KEY"))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const userId = env("OWNER_USER_ID");
  if (!userId || !env("BACKUP_SHEET_ID") || !env("GOOGLE_SERVICE_ACCOUNT")) {
    return json({ ok: false, error: "backup not configured" }, 500);
  }

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data: run, error: runError } = await db
    .from("backup_runs")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (runError) return json({ ok: false, error: runError.message }, 500);

  try {
    const [accounts, categories] = await Promise.all([
      db.from("accounts").select("id, name").eq("user_id", userId),
      db.from("categories").select("id, name").eq("user_id", userId),
    ]);
    if (accounts.error ?? categories.error) throw new Error((accounts.error ?? categories.error)!.message);
    const accountName = new Map(accounts.data.map((a) => [a.id, a.name]));
    const categoryName = new Map(categories.data.map((c) => [c.id, c.name]));

    const rows: BackupTransaction[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await db
        .from("transactions")
        .select(
          "occurred_at, amount_cents, kind, channel, payee, note, ref, source, needs_review, original_currency, original_minor, account_id, category_id",
        )
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("id")
        .range(from, from + 999);
      if (page.error) throw new Error(page.error.message);
      for (const t of page.data) {
        rows.push({
          ...t,
          account: accountName.get(t.account_id) ?? "?",
          category: t.category_id ? (categoryName.get(t.category_id) ?? "?") : null,
        });
      }
      if (page.data.length < 1000) break;
    }

    const tables = backupTables(rows);
    const token = await accessToken(JSON.parse(env("GOOGLE_SERVICE_ACCOUNT")) as ServiceAccount);
    const tabs = Object.keys(tables).sort();
    for (const year of tabs) await replaceTab(token, env("BACKUP_SHEET_ID"), year, tables[year]!);

    await db
      .from("backup_runs")
      .update({ status: "ok", finished_at: new Date().toISOString(), rows_written: rows.length, tabs })
      .eq("id", run.id);
    return json({ ok: true, rows: rows.length, tabs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("backup_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message.slice(0, 2000) })
      .eq("id", run.id);
    return json({ ok: false, error: message }, 500);
  }
});
