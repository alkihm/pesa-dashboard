// [4.3] Reads and writes for the review status: the interval from Settings, past reviews, what the checklist counts,
// and Mark reviewed. A review is saved as a `reviews` row plus one `review_checks` row per account that has a
// reading (reviews are never deleted, D-009). The review is completed last, so a failure part-way leaves only an
// unfinished review, which the status ignores.

import { useCallback, useEffect, useState } from "react";

import { reviewCountQuery } from "@/features/activity/summary";
import { loadBills } from "@/features/bills/data";
import { billStatus, nairobiMonth } from "@/features/bills/status";
import { reconcileState } from "@/lib/balances";
import { accountBalancesQuery } from "@/lib/data/accounts";
import { reviewStatus, type ReviewRecord, type ReviewResult, type ReviewStatus } from "@/lib/review";
import { supabase, type Db } from "@/lib/supabase";
import type { ReconcileRow } from "./reconcile";
import { useLive } from "@/lib/live";

export function reviewIntervalQuery(db: Db) {
  return db.from("settings").select("review_interval_days").maybeSingle();
}

export function reviewHistoryQuery(db: Db, limit = 8) {
  return db
    .from("reviews")
    .select("id, completed_at, result, review_checks(resolution)")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);
}

type HistoryData = NonNullable<Awaited<ReturnType<typeof reviewHistoryQuery>>["data"]>;

const RESULTS: readonly string[] = ["all_match", "fixed", "left_open"];

export function toRecords(rows: HistoryData): ReviewRecord[] {
  return rows
    .filter((r) => r.completed_at && RESULTS.includes(r.result ?? ""))
    .map((r) => ({
      id: r.id,
      completedAt: r.completed_at!,
      result: r.result as ReviewResult,
      leftOpen: (r.review_checks ?? []).filter((c) => c.resolution === "left_open").length,
    }));
}

/** What the header dot shows: three small reads, run when the app opens and when it comes back to the front. */
export async function loadReviewStatus(db: Db, now = new Date()): Promise<ReviewStatus> {
  const [balances, settings, last] = await Promise.all([
    accountBalancesQuery(db),
    reviewIntervalQuery(db),
    reviewHistoryQuery(db, 1),
  ]);
  const error = balances.error ?? settings.error ?? last.error;
  if (error) throw new Error(error.message);
  return reviewStatus({
    lastReviewedAt: toRecords(last.data ?? [])[0]?.completedAt ?? null,
    intervalDays: settings.data?.review_interval_days,
    mismatches: (balances.data ?? []).filter((a) => reconcileState(a) === "mismatch").length,
    now,
  });
}

export interface ReviewData {
  interval: number | null;
  records: ReviewRecord[];
  /** Transactions waiting for a category ([2.5] "To review"). */
  toReview: number;
  billsOverdue: number;
  billsThisWeek: number;
}

export async function loadReviewData(db: Db, now = new Date()): Promise<ReviewData> {
  const [settings, history, count, bills] = await Promise.all([
    reviewIntervalQuery(db),
    reviewHistoryQuery(db),
    reviewCountQuery(db),
    loadBills(db, nairobiMonth(now)),
  ]);
  const error = settings.error?.message ?? history.error?.message ?? count.error?.message ?? bills.error;
  if (error) throw new Error(error);
  const days = bills.rows.map((b) => billStatus(b, now).days).filter((d): d is number => d !== null);
  return {
    interval: settings.data?.review_interval_days ?? null,
    records: toRecords(history.data ?? []),
    toReview: count.count ?? 0,
    billsOverdue: days.filter((d) => d < 0).length,
    billsThisWeek: days.filter((d) => d >= 0 && d <= 7).length,
  };
}

export function useReviewData(db: () => Db = supabase) {
  const [result, setResult] = useState<{ data?: ReviewData; error?: string }>();
  const [version, setVersion] = useState(0);
  const fresh = useLive(["accounts", "transactions", "sms_messages", "bill_months", "reviews", "settings"]);

  useEffect(() => {
    let live = true;
    loadReviewData(db()).then(
      (data) => live && setResult({ data }),
      (e: unknown) => live && setResult({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [db, version, fresh]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: result?.data, error: result?.error, reload };
}

export interface CheckItem {
  key: string;
  done: boolean;
  text: string;
  fix?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The checklist above Mark reviewed: balances, transactions to categorise, bills. */
export function checklist(
  mismatches: number,
  data: Pick<ReviewData, "toReview" | "billsOverdue" | "billsThisWeek">,
) {
  const items: CheckItem[] = [
    mismatches
      ? { key: "balances", done: false, text: `${plural(mismatches, "balance is", "balances are")} off` }
      : { key: "balances", done: true, text: "All balances match" },
    data.toReview
      ? {
          key: "categories",
          done: false,
          text: `${plural(data.toReview, "transaction")} to categorise`,
          fix: "/activity",
        }
      : { key: "categories", done: true, text: "Everything categorised" },
    data.billsOverdue
      ? { key: "bills", done: false, text: `${plural(data.billsOverdue, "bill")} overdue`, fix: "/bills" }
      : {
          key: "bills",
          done: true,
          text: data.billsThisWeek
            ? `No bills overdue · ${plural(data.billsThisWeek, "bill")} due this week`
            : "No bills overdue",
        },
  ];
  return items;
}

export type Resolution = "matched" | "adjustment" | "left_open";

/**
 * One check per account with a reading: matched, fixed by an adjustment during this visit, or left open. Accounts
 * with no SMS or count yet have nothing to compare, so they get no check.
 */
export function reviewChecks(rows: readonly ReconcileRow[], adjusted: ReadonlySet<string>) {
  return rows
    .filter((r) => r.state === "match" || r.state === "mismatch")
    .map((r) => ({
      account_id: r.account.account_id,
      ledger_cents: r.account.balance_cents ?? 0,
      stated_cents: r.account.snapshot_cents,
      resolution: (r.state === "mismatch"
        ? "left_open"
        : adjusted.has(r.account.account_id)
          ? "adjustment"
          : "matched") as Resolution,
    }));
}

export function reviewResult(checks: readonly { resolution: Resolution }[]): ReviewResult {
  if (checks.some((c) => c.resolution === "left_open")) return "left_open";
  if (checks.some((c) => c.resolution === "adjustment")) return "fixed";
  return "all_match";
}

export async function markReviewed(
  db: Db,
  rows: readonly ReconcileRow[],
  adjusted: ReadonlySet<string> = new Set(),
  now = new Date(),
): Promise<ReviewResult> {
  const checks = reviewChecks(rows, adjusted);
  const result = reviewResult(checks);

  const started = await db.from("reviews").insert({ started_at: now.toISOString() }).select("id").single();
  if (started.error) throw new Error(started.error.message);
  const id = started.data.id;

  if (checks.length) {
    const saved = await db.from("review_checks").insert(checks.map((c) => ({ ...c, review_id: id })));
    if (saved.error) throw new Error(saved.error.message);
  }

  const done = await db.from("reviews").update({ completed_at: now.toISOString(), result }).eq("id", id);
  if (done.error) throw new Error(done.error.message);
  return result;
}
