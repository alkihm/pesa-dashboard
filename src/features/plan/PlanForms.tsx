import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { NumberField, SelectField, TextField } from "@/components/Field";
import { Switch } from "@/components/Switch";
import type { Account } from "@/lib/data/accounts";
import type { Track } from "@/lib/notify/plan";
import type { Db } from "@/lib/supabase";
import {
  archiveItem,
  saveMilestone,
  savePlan,
  saveRule,
  type Milestone,
  type Plan,
  type PlanRule,
} from "./data";
import { typedCents } from "./view";
import styles from "./Plan.module.css";

const typed = (cents: number | null | undefined) =>
  cents == null ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

function useSave(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** The why, the monthly saving target and payday. Starts the plan when there is none. */
export function PlanForm({ db, plan, onDone }: { db: Db; plan: Plan | null; onDone: () => void }) {
  const [why, setWhy] = useState(plan?.why ?? "");
  const [saving, setSaving] = useState(typed(plan?.savingTargetCents));
  const [payday, setPayday] = useState(plan?.payday ? String(plan.payday) : "");
  const { busy, error, setError, run } = useSave(onDone);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const target = saving.trim() ? typedCents(saving) : null;
    const day = payday.trim() ? Number(payday) : null;
    if (target === undefined || target === 0)
      return setError("Enter the monthly saving as an amount above zero.");
    if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31))
      return setError("Payday is a day of the month, 1 to 31.");
    void run(() => savePlan(db, { why: why.trim() || null, savingTargetCents: target, payday: day }));
  };

  return (
    <form className={styles.form} onSubmit={submit} aria-label={plan ? "Edit my plan" : "Start my plan"}>
      <TextField
        label="My why"
        hint="One line that reminds you why this matters."
        value={why}
        maxLength={280}
        onChange={(e) => setWhy(e.target.value)}
      />
      <div className={styles.formTwo}>
        <TextField
          label="Save each month"
          inputMode="decimal"
          placeholder="15,000"
          value={saving}
          onChange={(e) => setSaving(e.target.value)}
        />
        <NumberField
          label="Payday"
          min={1}
          max={31}
          placeholder="23"
          value={payday}
          onChange={(e) => setPayday(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" disabled={busy}>
          {plan ? "Save" : "Start my plan"}
        </Button>
        {plan && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

const TRACKS: { value: Track; label: string }[] = [
  { value: "manual", label: "I tick it myself" },
  { value: "account", label: "An account reaches a figure" },
  { value: "short_debt", label: "Short-term debt falls to a figure" },
];

/** Add or change a milestone. */
export function MilestoneForm({
  db,
  accounts,
  milestone,
  onDone,
}: {
  db: Db;
  accounts: Account[];
  milestone?: Milestone;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [emoji, setEmoji] = useState(milestone?.emoji ?? "");
  const [targetOn, setTargetOn] = useState(milestone?.targetOn ?? "");
  const [track, setTrack] = useState<Track>(milestone?.track ?? "manual");
  const [accountId, setAccountId] = useState(milestone?.accountId ?? "");
  const [target, setTarget] = useState(typed(milestone?.targetCents));
  const [from, setFrom] = useState(typed(milestone?.fromCents));
  const [headline, setHeadline] = useState(milestone?.headline ?? false);
  const headlineId = useId();
  const { busy, error, setError, run } = useSave(onDone);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give the milestone a name.");
    const targetCents = track === "manual" ? null : typedCents(target);
    const fromCents = track === "manual" || !from.trim() ? null : typedCents(from);
    if (targetCents === undefined) return setError("Enter the figure to reach (0 for a debt cleared).");
    if (fromCents === undefined) return setError("The starting figure is an amount, or leave it empty.");
    if (track === "account" && !accountId) return setError("Choose the account.");
    void run(() =>
      saveMilestone(
        db,
        {
          title,
          emoji: emoji.trim() || null,
          targetOn: targetOn || null,
          track,
          accountId: track === "account" ? accountId : null,
          targetCents,
          fromCents,
          headline,
        },
        milestone?.id,
      ),
    );
  };

  return (
    <form
      className={styles.form}
      onSubmit={submit}
      aria-label={milestone ? "Edit milestone" : "New milestone"}
    >
      <div className={styles.formRow}>
        <TextField label="Emoji" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} />
        <TextField
          label="Milestone"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <TextField
        label="Target date"
        type="date"
        value={targetOn}
        onChange={(e) => setTargetOn(e.target.value)}
      />
      <SelectField
        label="How it is tracked"
        value={track}
        onChange={(e) => setTrack(e.target.value as Track)}
      >
        {TRACKS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </SelectField>
      {track === "account" && (
        <SelectField label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Choose…</option>
          {accounts.map((a) => (
            <option key={a.account_id} value={a.account_id}>
              {a.name}
            </option>
          ))}
        </SelectField>
      )}
      {track !== "manual" && (
        <div className={styles.formTwo}>
          <TextField
            label="Figure to reach"
            hint="A debt: what it may still owe (0 = cleared). Savings: the balance."
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <TextField
            label="Starting figure"
            hint="Optional, for the bar."
            inputMode="decimal"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
      )}
      <div className={styles.row}>
        <span id={headlineId}>Big countdown on My plan</span>
        <Switch checked={headline} onChange={setHeadline} labelledBy={headlineId} />
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {milestone && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => archiveItem(db, milestone.id))}
          >
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}

/** Add or change a rule. */
export function RuleForm({ db, rule, onDone }: { db: Db; rule?: PlanRule; onDone: () => void }) {
  const [emoji, setEmoji] = useState(rule?.emoji ?? "");
  const [title, setTitle] = useState(rule?.title ?? "");
  const { busy, error, setError, run } = useSave(onDone);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Write the rule.");
    void run(() => saveRule(db, { emoji: emoji.trim() || null, title }, rule?.id));
  };

  return (
    <form className={styles.form} onSubmit={submit} aria-label={rule ? "Edit rule" : "New rule"}>
      <div className={styles.formRow}>
        <TextField label="Emoji" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} />
        <TextField label="Rule" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {rule && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => archiveItem(db, rule.id))}
          >
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
