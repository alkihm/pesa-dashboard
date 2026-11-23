import { Link } from "react-router";

import { Card } from "@/components/Card";
import type { Account } from "@/lib/data/accounts";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { formatDay } from "@/lib/due";
import { usePlan } from "./data";
import { planView, streakText, type MilestoneView } from "./view";
import styles from "./Plan.module.css";

export function Bar({ m, label }: { m: MilestoneView; label: string }) {
  const fillClass = m.reached ? styles.fillDone : m.isDebt ? styles.fillDebt : styles.fillSave;
  const detail = m.reached
    ? "Reached ✓"
    : m.isDebt
      ? `${formatAmount(m.currentCents ?? 0)} left`
      : `${formatAmount(m.currentCents ?? 0)} / ${formatAmount(m.targetCents ?? 0)}`;
  // Spans only: on /plan the bar sits inside a button.
  return (
    <span className={styles.barWrap}>
      <span className={styles.barTop}>
        <b>{label}</b>
        <span className={styles.muted}>{detail}</span>
      </span>
      <span
        className={styles.track}
        role="meter"
        aria-label={`${m.title}: ${Math.round(m.fill * 100)}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(m.fill * 100)}
      >
        <span className={fillClass} style={{ width: `${m.fill * 100}%` }} />
      </span>
    </span>
  );
}

// [My plan] Home: the "why", the next milestone with its countdown, up to three live bars and the two streaks.
export function PlanCard({
  accounts,
  db = supabase,
  now,
  className,
}: {
  accounts: Account[];
  db?: () => Db;
  now?: Date;
  className?: string;
}) {
  const { data, error } = usePlan(accounts, db);
  const classes = [styles.card, className].filter(Boolean).join(" ");

  if (error)
    return (
      <Card title="🌱 My plan" className={classes}>
        <p role="alert" className={styles.status}>
          Could not load your plan: {error}
        </p>
      </Card>
    );
  if (!data) return null;

  if (!data.plan)
    return (
      <Card title="🌱 My plan" className={classes}>
        <p className={styles.why}>
          Write down where you are going: your why, your milestones and your rules.
        </p>
        <Link to="/plan" className={styles.start}>
          Start my plan ›
        </Link>
      </Card>
    );

  const v = planView(accounts, data, now);
  const next = v.next;
  return (
    <Card
      title="🌱 My plan"
      className={classes}
      action={
        <Link to="/plan" className={styles.start}>
          Open ›
        </Link>
      }
    >
      {data.plan.why && <p className={styles.why}>“{data.plan.why}”</p>}
      {next && (
        <Link to="/plan" className={styles.next}>
          <span className={styles.count}>
            {next.days !== null && next.days >= 0 ? (
              <>
                <b>{next.days}</b>
                <span>{next.days === 1 ? "day" : "days"}</span>
              </>
            ) : (
              <b>{next.emoji ?? "🏁"}</b>
            )}
          </span>
          <span>
            <span className={styles.nextTitle}>{next.title}</span>
            <br />
            <span className={styles.muted}>
              {next.targetOn ? formatDay(next.targetOn) : "Next milestone"}
              {next.days !== null && next.days < 0 ? " · past its date" : ""}
            </span>
          </span>
        </Link>
      )}
      {v.bars.length > 0 && (
        <div className={styles.bars}>
          {v.bars.map((m) => (
            <Bar key={m.id} m={m} label={`${m.emoji ?? "🎯"} ${m.title}`} />
          ))}
        </div>
      )}
      <div className={styles.streaks}>
        <span className={styles.chip}>🚫 {streakText.borrow(v.borrowDays)}</span>
        {v.saving && <span className={styles.chip}>💚 {streakText.saving(v.saving.months)}</span>}
      </div>
    </Card>
  );
}
