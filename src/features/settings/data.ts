// [4.9] What Settings reads and writes: the one settings row, where the data comes from (last SMS from the
// Shortcut, last Sheet backup) and the counts on the Manage links.

import { useCallback, useEffect, useState } from "react";

import { alertsFrom, type Alerts } from "@/lib/alerts";
import type { Json } from "@/lib/database.types";
import { setMonthStartDay } from "@/lib/budgetMonth";
import { announce, useLive } from "@/lib/live";
import { setCurrency } from "@/lib/money";
import { intakeQuiet, parseFailing } from "@/lib/notify/rules";
import { DEFAULT_REVIEW_INTERVAL } from "@/lib/review";
import { supabase, type Db } from "@/lib/supabase";

export interface Prefs {
  reviewIntervalDays: number;
  alerts: Alerts;
  currency: string;
  monthStartDay: number;
}

export interface Backup {
  status: "running" | "ok" | "failed";
  finishedAt: string | null;
  startedAt: string;
  rows: number | null;
  tabs: string[];
  error: string | null;
}

export interface SettingsData {
  prefs: Prefs;
  lastSmsAt: string | null;
  /** [5.5] SMS received in the last day: read into the ledger, and left to review. */
  smsDay: { parsed: number; toReview: number };
  backup: Backup | null;
  counts: { accounts: number; smsMatched: number; categories: number; rules: number; bills: number };
}

const count = (r: { count: number | null }) => r.count ?? 0;

export async function loadSettings(db: Db, now = new Date()): Promise<SettingsData> {
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const smsSince = (status: "parsed" | "to_review") =>
    db
      .from("sms_messages")
      .select("id", { count: "exact", head: true })
      .eq("parse_status", status)
      .gte("received_at", dayAgo);
  const [settings, sms, backup, accounts, matched, categories, rules, bills, parsed, toReview] =
    await Promise.all([
      db.from("settings").select("review_interval_days, alerts, currency, month_start_day").maybeSingle(),
      db
        .from("sms_messages")
        .select("received_at")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("backup_runs")
        .select("status, started_at, finished_at, rows_written, tabs, error")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("accounts").select("id", { count: "exact", head: true }).is("archived_at", null),
      db
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null)
        .not("sms_account_hint", "is", null),
      db.from("categories").select("id", { count: "exact", head: true }).is("archived_at", null),
      db.from("payee_rules").select("id", { count: "exact", head: true }),
      db.from("bills").select("id", { count: "exact", head: true }).is("archived_at", null),
      smsSince("parsed"),
      smsSince("to_review"),
    ]);
  const error = settings.error ?? sms.error ?? backup.error;
  if (error) throw new Error(error.message);

  const b = backup.data;
  return {
    prefs: {
      reviewIntervalDays: settings.data?.review_interval_days ?? DEFAULT_REVIEW_INTERVAL,
      alerts: alertsFrom(settings.data?.alerts),
      currency: settings.data?.currency ?? "KES",
      monthStartDay: settings.data?.month_start_day ?? 1,
    },
    lastSmsAt: sms.data?.received_at ?? null,
    smsDay: { parsed: count(parsed), toReview: count(toReview) },
    backup: b
      ? {
          status: b.status as Backup["status"],
          startedAt: b.started_at,
          finishedAt: b.finished_at,
          rows: b.rows_written,
          tabs: b.tabs ?? [],
          error: b.error,
        }
      : null,
    counts: {
      accounts: count(accounts),
      smsMatched: count(matched),
      categories: count(categories),
      rules: count(rules),
      bills: count(bills),
    },
  };
}

export function useSettingsData(db: () => Db = supabase) {
  const [result, setResult] = useState<{ data?: SettingsData; error?: string }>();
  const fresh = useLive(["settings", "sms_messages", "accounts", "categories", "bill_months"]);

  useEffect(() => {
    let live = true;
    loadSettings(db()).then(
      (data) => live && setResult({ data }),
      (e: unknown) =>
        live && setResult((r) => ({ data: r?.data, error: e instanceof Error ? e.message : String(e) })),
    );
    return () => {
      live = false;
    };
  }, [db, fresh]);

  /** Shows a change at once; `undo` puts the previous values back if saving fails. */
  const setPrefs = useCallback((prefs: Prefs) => {
    setResult((r) => (r?.data ? { data: { ...r.data, prefs } } : r));
  }, []);

  return { data: result?.data, error: result?.error, setPrefs };
}

/** Saves the preferences (one row per user, made on first save) and tells every screen they changed. */
export async function savePrefs(db: Db, prefs: Prefs) {
  const { error } = await db.from("settings").upsert(
    {
      review_interval_days: prefs.reviewIntervalDays,
      alerts: prefs.alerts as unknown as Json,
      currency: prefs.currency,
      month_start_day: prefs.monthStartDay,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  // Every screen formats with the currency and groups by the month start: apply both, then everyone re-reads.
  setCurrency(prefs.currency);
  setMonthStartDay(prefs.monthStartDay);
  announce();
}

/** "4 min ago", "3 h ago", "2 days ago". */
export function ago(at: string, now = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** [5.5] The Shortcut row follows the intake alert rules (src/lib/notify/rules.ts): amber when no SMS came for 8
 *  daytime hours, or when too many of the last day's SMS could not be read. */
export function smsState(
  lastSmsAt: string | null,
  now = new Date(),
  smsDay: { parsed: number; toReview: number } = { parsed: 0, toReview: 0 },
) {
  if (!lastSmsAt) return { tone: "grey" as const, pill: "No SMS yet", meta: "Nothing received yet" };
  const last = `Last SMS received ${ago(lastSmsAt, now)}`;
  if (intakeQuiet(lastSmsAt, now)) return { tone: "amber" as const, pill: "Quiet", meta: last };
  if (parseFailing(smsDay))
    return {
      tone: "amber" as const,
      pill: "Not reading",
      meta: `${last} · ${smsDay.toReview} of ${smsDay.parsed + smsDay.toReview} in a day need a look`,
    };
  return { tone: "green" as const, pill: "✓ Connected", meta: last };
}

const rows = new Intl.NumberFormat("en-KE");

export function backupState(backup: Backup | null, now = new Date()) {
  if (!backup) return { tone: "grey" as const, pill: "Not run yet", meta: "Backs up nightly at 23:30" };
  if (backup.status === "running")
    return { tone: "blue" as const, pill: "Running", meta: `Started ${ago(backup.startedAt, now)}` };
  if (backup.status === "failed")
    return {
      tone: "red" as const,
      pill: "Failed",
      meta: `${backup.error ?? "The last backup failed"} · ${ago(backup.startedAt, now)}`,
    };
  const years = backup.tabs.length > 1 ? ` · ${backup.tabs[0]}–${backup.tabs[backup.tabs.length - 1]}` : "";
  return {
    tone: "green" as const,
    pill: "✓ Connected",
    meta: `${rows.format(backup.rows ?? 0)} rows${years} · synced ${ago(backup.finishedAt ?? backup.startedAt, now)}`,
  };
}
