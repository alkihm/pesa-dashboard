import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { NumberField, TextField } from "@/components/Field";
import { Segmented } from "@/components/Segmented";
import { Switch } from "@/components/Switch";
import { supabase, type Db } from "@/lib/supabase";
import {
  buildRow,
  countsInNet,
  emptyForm,
  isDebt,
  KINDS,
  problem,
  smsSources,
  withKind,
  type DebtTerm,
  type ExistingAccount,
  type Form,
} from "./form";
import styles from "./NewAccountScreen.module.css";

const TERMS: { value: DebtTerm; label: string }[] = [
  { value: "short", label: "Short term" },
  { value: "long", label: "Long term" },
];

function existingAccountsQuery(db: Db) {
  return db.from("accounts").select("name, sms_account_hint, archived_at, sort_order");
}

// [2.9] New account: wallets, banks, cash, cards, savings and loans, with the SMS each one receives.
export function NewAccountScreen({ db = supabase }: { db?: () => Db }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [existing, setExisting] = useState<ExistingAccount[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void existingAccountsQuery(db()).then(({ data }) => live && setExisting(data ?? []));
    return () => {
      live = false;
    };
  }, [db]);

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
  };
  const debt = isDebt(form.kind);
  const sources = smsSources(form.kind);

  async function save() {
    const why = problem(form, existing);
    if (why) return setError(why);
    setSaving(true);
    const { error } = await db().from("accounts").insert(buildRow(form, existing));
    setSaving(false);
    if (error) return setError(error.message);
    void navigate("/accounts");
  }

  return (
    <>
      <PageHeader title="New account" subtitle="Wallets, banks, cards, savings and loans" back="/accounts" />
      <div className={styles.page}>
        <form
          aria-label="New account"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Card>
            <div className={styles.form}>
              <div role="group" aria-label="Type" className={styles.group}>
                <span className={styles.label}>Type</span>
                <div className={styles.kinds}>
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      aria-pressed={k.value === form.kind}
                      className={styles.kind}
                      onClick={() => setForm((f) => withKind(f, k.value))}
                    >
                      <span aria-hidden="true" className={styles.kindEmoji}>
                        {k.emoji}
                      </span>
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.nameRow}>
                <TextField
                  label="Emoji"
                  value={form.emoji}
                  maxLength={4}
                  onChange={(e) => set({ emoji: e.target.value })}
                  className={styles.emoji}
                />
                <TextField
                  label="Name"
                  placeholder={form.kind === "loan" ? "e.g. Car loan" : "e.g. M-PESA"}
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </div>

              {debt && (
                <div className={styles.section}>
                  <span className={styles.label}>Debt</span>
                  <Segmented
                    label="Debt term"
                    variant="surface"
                    options={TERMS}
                    value={form.debtTerm ?? "short"}
                    onChange={(debtTerm) => set({ debtTerm })}
                  />
                  <p className={styles.hint}>
                    Short-term debt (Fuliza, a card) is taken off your net position; long-term (a car loan) is
                    tracked on its own.
                  </p>
                  <div className={styles.row}>
                    {(form.kind === "card" || form.debtTerm === "short") && (
                      <NumberField
                        label="Limit (KES) · optional"
                        value={form.limit}
                        onChange={(e) => set({ limit: e.target.value })}
                      />
                    )}
                    {form.debtTerm === "long" && (
                      <NumberField
                        label="Borrowed (KES) · optional"
                        value={form.borrowed}
                        onChange={(e) => set({ borrowed: e.target.value })}
                      />
                    )}
                    <NumberField
                      label="Due day · optional"
                      placeholder="1–31"
                      value={form.dueDay}
                      onChange={(e) => set({ dueDay: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {sources.length > 0 && (
                <div role="group" aria-label="SMS matching" className={styles.group}>
                  <span className={styles.label}>Receives SMS from</span>
                  <div className={styles.chips}>
                    <Chip selected={!form.source} onClick={() => set({ source: "" })}>
                      None
                    </Chip>
                    {sources.map((s) => (
                      <Chip
                        key={s.value}
                        selected={s.value === form.source}
                        onClick={() => set({ source: s.value })}
                      >
                        {s.label}
                      </Chip>
                    ))}
                  </div>
                  {form.source === "kcb-card" && (
                    <TextField
                      label="Card ends in"
                      placeholder="4321"
                      inputMode="numeric"
                      maxLength={4}
                      value={form.last4}
                      onChange={(e) => set({ last4: e.target.value.replace(/\D/g, "") })}
                    />
                  )}
                  <p className={styles.hint}>
                    {form.source
                      ? "Payments in these messages are recorded on this account automatically."
                      : "Without a source, add this account's transactions by hand."}
                  </p>
                </div>
              )}

              <div className={styles.switchRow}>
                <span className={styles.switchText}>
                  <span id="net-label">Counts in net position</span>
                  <span className={styles.hint}>Net position = money you hold minus short-term debt.</span>
                </span>
                <Switch
                  checked={countsInNet(form)}
                  labelledBy="net-label"
                  onChange={(checked) => set({ countsInNet: checked })}
                />
              </div>

              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}

              <div className={styles.actions}>
                <Button variant="ghost" onClick={() => void navigate(-1)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save account"}
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
