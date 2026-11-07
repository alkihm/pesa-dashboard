// [4.9] What Settings reads and writes: the one settings row, where the data comes from (last SMS from the
// Shortcut, last Sheet backup) and the counts on the Manage links.

import { useCallback, useEffect, useState } from "react";

import { alertsFrom, type Alerts } from "@/lib/alerts";
import type { Json } from "@/lib/database.types";
import { setMonthStartDay } from "@/lib/budgetMonth";
import { announce, useLive } from "@/lib/live";
import { setCurrency } from "@/lib/money";
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
  backup: Backup | null;
  counts: { accounts: number; smsMatched: number; categories: number; rules: number; bills: number };
}

const count = (r: { count: number | null }) => r.count ?? 0;

export async function loadSettings(db: Db): Promise<SettingsData> {
  const [settings, sms, backup, accounts, matched, categories, rules, bills] = await Promise.all([
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

/** No SMS for this long and the Shortcut row turns amber. */
export const SMS_QUIET_DAYS = 2;

export function smsState(lastSmsAt: string | null, now = new Date()) {
  if (!lastSmsAt) return { tone: "grey" as const, pill: "No SMS yet", meta: "Nothing received yet" };
  const quiet = now.getTime() - new Date(lastSmsAt).getTime() > SMS_QUIET_DAYS * 86_400_000;
  return {
    tone: quiet ? ("amber" as const) : ("green" as const),
    pill: quiet ? "Quiet" : "✓ Connected",
    meta: `Last SMS received ${ago(lastSmsAt, now)}`,
  };
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
