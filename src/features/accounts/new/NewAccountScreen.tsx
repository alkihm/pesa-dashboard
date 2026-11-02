import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { NumberField, TextField } from "@/components/Field";
import { supabase, type Db } from "@/lib/supabase";
import {
  buildAccount,
  buildOpening,
  countsInNet,
  emptyForm,
  ICONS,
  isDebt,
  KINDS,
  labels,
  problem,
  smsSources,
  withKind,
  type ExistingAccount,
  type Form,
  type Kind,
} from "./form";
import styles from "./NewAccountScreen.module.css";

const TERMS = [
  { value: "short", label: "⚡ Short-term" },
  { value: "long", label: "🚗 Long-term" },
] as const;

/** The form's state and its save: shared by the page and the card on the Accounts screen. */
function useNewAccount(db: () => Db, onSaved: () => void) {
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [existing, setExisting] = useState<ExistingAccount[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void db()
      .from("accounts")
      .select("name, sms_account_hint, archived_at, sort_order")
      .then(({ data }) => live && setExisting(data ?? []));
    return () => {
      live = false;
    };
  }, [db, version]);

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
  };

  async function save() {
    const why = problem(form, existing);
    if (why) return setError(why);
    setSaving(true);
    const account = await db().from("accounts").insert(buildAccount(form, existing)).select("id").single();
    if (account.error) {
      setSaving(false);
      return setError(account.error.message);
    }
    const opening = buildOpening(form, account.data.id);
    const balance = opening ? await db().from("transactions").insert(opening) : { error: null };
    setSaving(false);
    if (balance.error) {
      // The account exists now; reload so saving again cannot make a second one.
      setVersion((v) => v + 1);
      return setError(
        `The account was saved, but not its balance (${balance.error.message}). Add it from Reconcile.`,
      );
    }
    setForm(emptyForm(form.kind));
    setVersion((v) => v + 1);
    onSaved();
  }

  return { form, set, setKind: (kind: Kind) => setForm((f) => withKind(f, kind)), error, saving, save };
}

type NewAccount = ReturnType<typeof useNewAccount>;

function TypeTiles({ state, variant }: { state: NewAccount; variant: "header" | "surface" }) {
  return (
    <div role="radiogroup" aria-label="Account type" className={`${styles.kinds} ${styles[variant]}`}>
      {KINDS.map((k) => (
        <button
          key={k.value}
          type="button"
          role="radio"
          aria-checked={k.value === state.form.kind}
          className={styles.kind}
          onClick={() => state.setKind(k.value)}
        >
          <span aria-hidden="true" className={styles.kindEmoji}>
            {k.emoji}
          </span>
          {k.label}
        </button>
      ))}
    </div>
  );
}

function Fields({ state }: { state: NewAccount }) {
  const { form, set } = state;
  const netId = useId();
  const debt = isDebt(form.kind);
  const sources = smsSources(form.kind);
  const text = labels(form.kind);

  return (
    <form
      aria-label="New account"
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void state.save();
      }}
    >
      <TextField
        label="Name"
        placeholder={KINDS.find((k) => k.value === form.kind)!.example}
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
      />

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Icon</legend>
        <div className={styles.icons}>
          {ICONS.map((i) => (
            <button
              key={i.emoji}
              type="button"
              aria-label={i.name}
              aria-pressed={i.emoji === form.emoji}
              className={styles.icon}
              onClick={() => set({ emoji: i.emoji })}
            >
              {i.emoji}
            </button>
          ))}
        </div>
      </fieldset>

      <NumberField
        label={text.balance}
        placeholder="KES 0"
        value={form.balance}
        onChange={(e) => set({ balance: e.target.value })}
      />

      {debt && (
        <>
          <div className={styles.row}>
            <NumberField
              label={text.limit}
              placeholder="KES 0"
              value={form.limit}
              onChange={(e) => set({ limit: e.target.value })}
            />
            <NumberField
              label="Due day each month"
              placeholder="e.g. 5"
              value={form.dueDay}
              onChange={(e) => set({ dueDay: e.target.value })}
            />
          </div>
          <div role="radiogroup" aria-label="Debt group" className={styles.terms}>
            {TERMS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={form.debtTerm === t.value}
                className={styles.term}
                onClick={() => set({ debtTerm: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {sources.length > 0 && (
        <section aria-label="Match SMS automatically" className={styles.sms}>
          <h3 className={styles.smsTitle}>📩 Match SMS automatically</h3>
          <p className={styles.hint}>Messages from this sender update the balance.</p>
          <div role="group" aria-label="Sender" className={styles.chips}>
            <Chip selected={!form.source} onClick={() => set({ source: "" })}>
              None
            </Chip>
            {sources.map((s) => (
              <Chip key={s.value} selected={s.value === form.source} onClick={() => set({ source: s.value })}>
                {s.label}
              </Chip>
            ))}
          </div>
          {form.source === "kcb-card" && (
            <TextField
              label="Card ends with"
              placeholder="e.g. 1234"
              inputMode="numeric"
              maxLength={4}
              value={form.last4}
              onChange={(e) => set({ last4: e.target.value.replace(/\D/g, "") })}
            />
          )}
        </section>
      )}

      <label className={styles.check} htmlFor={netId}>
        <input
          id={netId}
          type="checkbox"
          checked={countsInNet(form)}
          onChange={(e) => set({ countsInNet: e.target.checked })}
        />
        Count in net position
      </label>

      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}

      <Button type="submit" block disabled={state.saving}>
        {state.saving ? "Saving…" : "Save account"}
      </Button>
    </form>
  );
}

/** The New account card for the Accounts screen's side column ([2.3], "Accounts, savings & debt · desktop"). */
export function NewAccountCard({ db = supabase, onSaved }: { db?: () => Db; onSaved: () => void }) {
  const state = useNewAccount(db, onSaved);
  return (
    <Card title="＋ New account">
      <div className={styles.card}>
        <TypeTiles state={state} variant="surface" />
        <Fields state={state} />
      </div>
    </Card>
  );
}

// [2.9] New account as its own page: phones pick the type in the header, as in the "New account" board.
export function NewAccountScreen({ db = supabase }: { db?: () => Db }) {
  const navigate = useNavigate();
  const state = useNewAccount(db, () => void navigate("/accounts"));

  return (
    <>
      <PageHeader
        title="New account"
        subtitle="Wallets, banks, cards, savings and loans"
        back="/accounts"
        controls={
          <div className={styles.phoneOnly}>
            <TypeTiles state={state} variant="header" />
          </div>
        }
      />
      <div className={styles.page}>
        <Card>
          <div className={styles.card}>
            <div className={styles.desktopOnly}>
              <TypeTiles state={state} variant="surface" />
            </div>
            <Fields state={state} />
          </div>
        </Card>
      </div>
    </>
  );
}
