import { useState } from "react";

import { PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { Switch } from "@/components/Switch";
import { ordinal } from "@/lib/budgetMonth";
import { useAccounts } from "@/lib/data/accounts";
import { formatDay } from "@/lib/due";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { Bar } from "./PlanCard";
import { MilestoneForm, PlanForm, RuleForm } from "./PlanForms";
import { setAlert, setDone, usePlan, type PlanData } from "./data";
import { countdownText, planView, streakText, type MilestoneView } from "./view";
import styles from "./Plan.module.css";

type Editing = { what: "plan" } | { what: "milestone"; id?: string } | { what: "rule"; id?: string } | null;

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fullDay = (on: string) => longDate.format(new Date(`${on}T00:00:00Z`));

function trackText(m: MilestoneView) {
  if (m.track === "short_debt") return "tracks short-term debt";
  if (m.track === "account")
    return m.currentCents === null ? "account removed · tick it yourself" : "tracks an account";
  return "tick it when done";
}

// [My plan] /plan: the headline countdown with the why, the two streaks, milestones, rules and the reminder switches.
export function PlanScreen({ db = supabase, now }: { db?: () => Db; now?: Date }) {
  const { accounts, error: accountsError } = useAccounts(db);
  const { data, error } = usePlan(accounts, db);
  const [editing, setEditing] = useState<Editing>(null);
  const close = () => setEditing(null);
  const problem = accountsError ?? error;

  return (
    <>
      <PageHeader
        title="🌱 My plan"
        subtitle={data?.plan ? `Started ${formatDay(data.plan.startedOn)}` : undefined}
        back="/"
      />
      <div className={styles.page}>
        {problem && (
          <p role="alert" className={styles.status}>
            Could not load your plan: {problem}
          </p>
        )}
        {!problem && (!accounts || !data) && <p className={styles.status}>Loading…</p>}

        {accounts && data && !data.plan && (
          <Card title="Start my plan">
            <p className={styles.muted}>
              Your why keeps the bigger goal in view. The saving target drives the saving streak and the
              payday nudge.
            </p>
            <PlanForm db={db()} plan={null} onDone={close} />
          </Card>
        )}

        {accounts && data?.plan && (
          <Plan
            data={data}
            accounts={accounts}
            db={db}
            now={now}
            editing={editing}
            setEditing={setEditing}
            close={close}
          />
        )}
      </div>
    </>
  );
}

function Plan({
  data,
  accounts,
  db,
  now,
  editing,
  setEditing,
  close,
}: {
  data: PlanData;
  accounts: NonNullable<ReturnType<typeof useAccounts>["accounts"]>;
  db: () => Db;
  now?: Date;
  editing: Editing;
  setEditing: (e: Editing) => void;
  close: () => void;
}) {
  const plan = data.plan!;
  const v = planView(accounts, data, now);
  const h = v.headline;
  const [alertError, setAlertError] = useState<string>();
  const toggle = (key: "plan_payday" | "plan_milestone") => (on: boolean) => {
    setAlertError(undefined);
    setAlert(db(), data.alerts, key, on).catch((e: unknown) =>
      setAlertError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <>
      <section aria-label="Countdown" className={styles.hero}>
        {h ? (
          <>
            <span className={styles.heroLabel}>{h.title}</span>
            <span className={styles.heroValue}>
              {h.days !== null && h.days >= 0 ? h.days : (h.emoji ?? "🏁")}
            </span>
            <span className={styles.heroSub}>
              {h.days !== null && h.days >= 0 ? `${h.days === 1 ? "day" : "days"} to go · ` : ""}
              {h.targetOn ? fullDay(h.targetOn) : "No date yet"}
            </span>
          </>
        ) : (
          <>
            <span className={styles.heroLabel}>Every milestone reached</span>
            <span className={styles.heroValue}>🌟</span>
          </>
        )}
        {editing?.what === "plan" ? null : (
          <div className={styles.whyBox}>
            <small>My why</small>
            {plan.why ?? "Add the line that reminds you why this matters."}
            <button type="button" className={styles.heroEdit} onClick={() => setEditing({ what: "plan" })}>
              Edit
            </button>
          </div>
        )}
      </section>
      {editing?.what === "plan" && <PlanForm db={db()} plan={plan} onDone={close} />}

      <Card title="🔥 Streaks">
        <div className={styles.streakGrid}>
          <div className={`${styles.streak} ${styles.streakBorrow}`}>
            <b>{v.borrowDays}</b>
            <span className={styles.muted}>{streakText.borrow(v.borrowDays).replace(/^\d+ /, "")}</span>
          </div>
          <div className={`${styles.streak} ${styles.streakSave}`}>
            {v.saving ? (
              <>
                <b>{v.saving.months}</b>
                <span className={styles.muted}>
                  {v.saving.months === 1 ? "month" : "months"} saving · this month{" "}
                  {formatAmount(Math.max(0, v.saving.thisMonthCents))} / {formatAmount(v.saving.targetCents)}
                </span>
              </>
            ) : (
              <span className={styles.muted}>
                Set a monthly saving target (Edit) to start the saving streak.
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="🏁 Milestones"
        action={
          <button type="button" className={styles.addLink} onClick={() => setEditing({ what: "milestone" })}>
            ＋ Add
          </button>
        }
      >
        {editing?.what === "milestone" && !editing.id && (
          <MilestoneForm db={db()} accounts={accounts} onDone={close} />
        )}
        {v.milestones.length === 0 ? (
          <p className={styles.muted}>
            No milestones yet. Add the first one: what, by when, and how it is tracked.
          </p>
        ) : (
          <ol className={styles.timeline}>
            {v.milestones.map((m, i) =>
              editing?.what === "milestone" && editing.id === m.id ? (
                <li key={m.id}>
                  <MilestoneForm db={db()} accounts={accounts} milestone={m} onDone={close} />
                </li>
              ) : (
                <li key={m.id} className={styles.step}>
                  <button
                    type="button"
                    className={`${styles.tick} ${m.reached ? styles.tickDone : m.id === v.next?.id ? styles.tickNow : ""}`}
                    aria-label={m.reached ? `${m.title}: done` : `Mark ${m.title} done`}
                    aria-pressed={m.reached}
                    disabled={m.track !== "manual" && m.currentCents !== null && !m.doneAt}
                    onClick={() => void setDone(db(), m.id, !m.doneAt)}
                  >
                    {m.reached ? "✓" : (m.emoji ?? i + 1)}
                  </button>
                  <button
                    type="button"
                    className={styles.stepBody}
                    onClick={() => setEditing({ what: "milestone", id: m.id })}
                  >
                    <span className={styles.stepTitle}>{m.title}</span>
                    <span className={styles.stepMeta}>
                      {m.targetOn ? formatDay(m.targetOn) : "No date"} · {trackText(m)}
                    </span>
                    {m.track !== "manual" && m.currentCents !== null && (
                      <span className={styles.stepBar}>
                        <Bar m={m} label="" />
                      </span>
                    )}
                  </button>
                  <span className={styles.muted}>{m.reached ? "Done" : countdownText(m.days)}</span>
                </li>
              ),
            )}
          </ol>
        )}
      </Card>

      <Card
        title="📌 My rules"
        action={
          <button type="button" className={styles.addLink} onClick={() => setEditing({ what: "rule" })}>
            ＋ Add
          </button>
        }
      >
        {editing?.what === "rule" && !editing.id && <RuleForm db={db()} onDone={close} />}
        {data.rules.length === 0 ? (
          <p className={styles.muted}>
            No rules yet. Short promises to yourself, like “No new mobile loans”.
          </p>
        ) : (
          <ul className={styles.rules}>
            {data.rules.map((r) =>
              editing?.what === "rule" && editing.id === r.id ? (
                <li key={r.id}>
                  <RuleForm db={db()} rule={r} onDone={close} />
                </li>
              ) : (
                <li key={r.id}>
                  <button
                    type="button"
                    className={styles.rule}
                    onClick={() => setEditing({ what: "rule", id: r.id })}
                  >
                    <span aria-hidden="true">{r.emoji ?? "📌"}</span>
                    <span>{r.title}</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </Card>

      <Card title="🔔 Reminders">
        <div className={styles.row}>
          <span>Payday nudge{plan.payday ? ` · the ${ordinal(plan.payday)}` : " · set payday in Edit"}</span>
          <Switch checked={data.alerts.plan_payday} onChange={toggle("plan_payday")} label="Payday nudge" />
        </div>
        <div className={styles.row}>
          <span>A week before each milestone, and when reached</span>
          <Switch
            checked={data.alerts.plan_milestone}
            onChange={toggle("plan_milestone")}
            label="Milestone reminders"
          />
        </div>
        {alertError && (
          <p role="alert" className={styles.error}>
            Could not save: {alertError}
          </p>
        )}
        <p className={styles.muted}>Reminders come as notifications when they are on in Settings.</p>
      </Card>
    </>
  );
}
