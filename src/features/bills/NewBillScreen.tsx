import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";

import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { NumberField, SelectField, TextField } from "@/components/Field";
import { useCategories } from "@/lib/data/categories";
import { supabase, type Db } from "@/lib/supabase";
import { payingAccountsQuery } from "./data";
import { BILL_ICONS, billProblem, buildBill, dueDayPassed, emptyBillForm, type BillForm } from "./form";
import styles from "./NewBill.module.css";

type PayingAccount = { id: string; name: string; emoji: string | null };

// [3.1] Add bill: name, icon, amount and due day; optionally the account it is paid from and its category.
// With an SMS payee, an SMS payment to it marks the month paid ([3.2], D-015).
export function NewBillScreen({ db = supabase, now }: { db?: () => Db; now?: Date }) {
  const navigate = useNavigate();
  const { categories } = useCategories(db);
  const [accounts, setAccounts] = useState<PayingAccount[]>([]);
  const [form, setForm] = useState<BillForm>(emptyBillForm);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const startId = useId();

  useEffect(() => {
    let live = true;
    void payingAccountsQuery(db()).then(({ data }) => live && setAccounts(data ?? []));
    return () => {
      live = false;
    };
  }, [db]);

  const set = (patch: Partial<BillForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
  };

  async function save() {
    const why = billProblem(form);
    if (why) return setError(why);
    setSaving(true);
    const { error } = await db().from("bills").insert(buildBill(form, now));
    setSaving(false);
    if (error) return setError(error.message);
    void navigate("/bills");
  }

  const spending = (categories ?? []).filter((c) => c.kind === "spending" && !c.system);

  return (
    <>
      <PageHeader title="Add bill" subtitle="A bill that comes every month" back="/bills" />
      <div className={styles.page}>
        <Card>
          <form
            aria-label="Add bill"
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <TextField
              label="Name"
              placeholder="e.g. Internet"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />

            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Icon</legend>
              <div className={styles.icons}>
                {BILL_ICONS.map((i) => (
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

            <div className={styles.row}>
              <NumberField
                label="Amount each month"
                placeholder="KES 0"
                hint="An estimate is fine"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
              />
              <NumberField
                label="Due day"
                placeholder="e.g. 5"
                hint="31 means the month's last day"
                value={form.dueDay}
                onChange={(e) => set({ dueDay: e.target.value })}
              />
            </div>

            {dueDayPassed(form, now) && (
              <label className={styles.check} htmlFor={startId}>
                <input
                  id={startId}
                  type="checkbox"
                  checked={form.startNextMonth}
                  onChange={(e) => set({ startNextMonth: e.target.checked })}
                />
                Already paid this month — start from next month
              </label>
            )}

            <div className={styles.row}>
              <SelectField
                label="Paid from · optional"
                value={form.accountId}
                onChange={(e) => set({ accountId: e.target.value })}
              >
                <option value="">Not set</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji ? `${a.emoji} ` : ""}
                    {a.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Category · optional"
                value={form.categoryId}
                onChange={(e) => set({ categoryId: e.target.value })}
              >
                <option value="">Not set</option>
                {spending.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji ? `${c.emoji} ` : ""}
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </div>

            <TextField
              label="📩 SMS payee · optional"
              placeholder="e.g. KPLC"
              hint="Part of the payee name in the M-PESA or bank SMS. When a payment to it arrives near the due date, the bill is marked paid."
              value={form.payeeMatch}
              onChange={(e) => set({ payeeMatch: e.target.value })}
            />

            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <Button type="submit" block disabled={saving}>
              {saving ? "Saving…" : "Save bill"}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
