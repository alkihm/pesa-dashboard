// [My plan] My plan: reading and saving the plan (plans, plan_items), the two streaks' raw figures, and the reminder
// switches (settings.alerts). The rules themselves are pure, in src/lib/notify/plan.ts, shared with notify.

import { useEffect, useState } from "react";

import { alertsFrom, type AlertKey, type Alerts } from "@/lib/alerts";
import { budgetMonthOf, budgetMonthRange } from "@/lib/budgetMonth";
import type { Account } from "@/lib/data/accounts";
import type { Json } from "@/lib/database.types";
import { announce, useLive } from "@/lib/live";
import type { PlanMilestone, Track } from "@/lib/notify/plan";
import { supabase, type Db } from "@/lib/supabase";

export interface Plan {
  id: string;
  why: string | null;
  savingTargetCents: number | null;
  payday: number | null;
  startedOn: string;
  version: number;
}

export interface PlanRule {
  id: string;
  emoji: string | null;
  title: string;
  sortOrder: number;
  version: number;
}

export type Milestone = PlanMilestone & { version: number };

export interface PlanData {
  plan: Plan | null;
  milestones: Milestone[];
  rules: PlanRule[];
  /** When money was last drawn from a short-term loan, or null. */
  lastDrawAt: string | null;
  /** Net money moved into savings per budget month since the plan started ("2026-11-01" → cents). */
  savedByMonth: Record<string, number>;
  alerts: Alerts;
}

/** Short-term loans: a draw on one breaks the no-borrowing streak. Cards and long-term loans do not count. */
export const shortLoanIds = (accounts: readonly Account[]) =>
  accounts.filter((a) => a.kind === "loan" && a.debt_term === "short").map((a) => a.account_id);
const savingsIds = (accounts: readonly Account[]) =>
  accounts.filter((a) => a.kind === "savings").map((a) => a.account_id);

export async function loadPlan(db: Db, accounts: readonly Account[]): Promise<PlanData> {
  const [planRow, items, settings] = await Promise.all([
    db.from("plans").select("*").maybeSingle(),
    db.from("plan_items").select("*").is("archived_at", null).order("sort_order").order("created_at"),
    db.from("settings").select("alerts").maybeSingle(),
  ]);
  const error = planRow.error ?? items.error ?? settings.error;
  if (error) throw new Error(error.message);

  const p = planRow.data;
  const plan: Plan | null = p
    ? {
        id: p.id,
        why: p.why,
        savingTargetCents: p.saving_target_cents,
        payday: p.payday,
        startedOn: p.started_on,
        version: p.version,
      }
    : null;

  const rows = items.data ?? [];
  const milestones: Milestone[] = rows
    .filter((r) => r.kind === "milestone")
    .map((r) => ({
      id: r.id,
      title: r.title,
      emoji: r.emoji,
      targetOn: r.target_on,
      track: r.track as Track,
      accountId: r.account_id,
      targetCents: r.target_cents,
      fromCents: r.from_cents,
      doneAt: r.done_at,
      headline: r.headline,
      sortOrder: r.sort_order,
      version: r.version,
    }));
  const rules: PlanRule[] = rows
    .filter((r) => r.kind === "rule")
    .map((r) => ({ id: r.id, emoji: r.emoji, title: r.title, sortOrder: r.sort_order, version: r.version }));

  let lastDrawAt: string | null = null;
  const loans = shortLoanIds(accounts);
  if (loans.length) {
    const draw = await db
      .from("transactions")
      .select("occurred_at")
      .in("account_id", loans)
      .lt("amount_cents", 0)
      .not("kind", "in", "(adjustment,opening)")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (draw.error) throw new Error(draw.error.message);
    lastDrawAt = draw.data?.occurred_at ?? null;
  }

  const savedByMonth: Record<string, number> = {};
  const savings = savingsIds(accounts);
  if (plan && savings.length) {
    const from = budgetMonthRange(budgetMonthOf(new Date(`${plan.startedOn}T12:00:00+03:00`))).from;
    const moved = await db
      .from("transactions")
      .select("occurred_at, amount_cents")
      .in("account_id", savings)
      .in("kind", ["transfer", "income"])
      .is("deleted_at", null)
      .gte("occurred_at", from);
    if (moved.error) throw new Error(moved.error.message);
    for (const t of moved.data ?? []) {
      const month = budgetMonthOf(new Date(t.occurred_at));
      savedByMonth[month] = (savedByMonth[month] ?? 0) + t.amount_cents;
    }
  }

  return { plan, milestones, rules, lastDrawAt, savedByMonth, alerts: alertsFrom(settings.data?.alerts) };
}

/** The plan and everything around it; reads again when accounts, transactions or the plan change. */
export function usePlan(accounts: readonly Account[] | undefined, db: () => Db = supabase) {
  const [result, setResult] = useState<{ data?: PlanData; error?: string }>();
  const fresh = useLive(["plans", "transactions", "accounts", "settings"]);

  useEffect(() => {
    if (!accounts) return;
    let live = true;
    loadPlan(db(), accounts).then(
      (data) => live && setResult({ data }),
      (e: unknown) => live && setResult({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [accounts, db, fresh]);

  return { data: result?.data, error: result?.error };
}

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

/** Creates the plan (one per user) or changes it. */
export async function savePlan(
  db: Db,
  values: { why: string | null; savingTargetCents: number | null; payday: number | null },
) {
  const { error } = await db
    .from("plans")
    .upsert(
      { why: values.why, saving_target_cents: values.savingTargetCents, payday: values.payday },
      { onConflict: "user_id" },
    );
  fail(error);
  announce(["plans"]);
}

export interface MilestoneInput {
  title: string;
  emoji: string | null;
  targetOn: string | null;
  track: Track;
  accountId: string | null;
  targetCents: number | null;
  fromCents: number | null;
  headline: boolean;
}

const milestoneRow = (m: MilestoneInput) => ({
  kind: "milestone",
  title: m.title.trim(),
  emoji: m.emoji,
  target_on: m.targetOn,
  track: m.track,
  account_id: m.track === "account" ? m.accountId : null,
  target_cents: m.track === "manual" ? null : m.targetCents,
  from_cents: m.track === "manual" ? null : m.fromCents,
  headline: m.headline,
});

/** Adds or changes a milestone. Making it the headline takes the headline off any other first. */
export async function saveMilestone(db: Db, m: MilestoneInput, id?: string) {
  if (m.headline) {
    const off = db.from("plan_items").update({ headline: false }).eq("headline", true);
    fail((await (id ? off.neq("id", id) : off)).error);
  }
  const { error } = id
    ? await db.from("plan_items").update(milestoneRow(m)).eq("id", id)
    : await db.from("plan_items").insert(milestoneRow(m));
  fail(error);
  announce(["plans"]);
}

/** Ticks a milestone, or takes the tick off. */
export async function setDone(db: Db, id: string, done: boolean, now = new Date()) {
  fail(
    (
      await db
        .from("plan_items")
        .update({ done_at: done ? now.toISOString() : null })
        .eq("id", id)
    ).error,
  );
  announce(["plans"]);
}

export async function saveRule(db: Db, rule: { emoji: string | null; title: string }, id?: string) {
  const row = { kind: "rule", emoji: rule.emoji, title: rule.title.trim() };
  const { error } = id
    ? await db.from("plan_items").update(row).eq("id", id)
    : await db.from("plan_items").insert(row);
  fail(error);
  announce(["plans"]);
}

/** Removes a milestone or rule from the plan (kept, archived). */
export async function archiveItem(db: Db, id: string, now = new Date()) {
  fail(
    (await db.from("plan_items").update({ archived_at: now.toISOString(), headline: false }).eq("id", id))
      .error,
  );
  announce(["plans"]);
}

/** One reminder switch, saved into settings.alerts with the others kept. */
export async function setAlert(db: Db, alerts: Alerts, key: AlertKey, on: boolean) {
  const next = { ...alerts, [key]: on };
  const { error } = await db
    .from("settings")
    .upsert({ alerts: next as unknown as Json }, { onConflict: "user_id" });
  fail(error);
  announce(["settings"]);
}
