import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import { NumberField, SelectField, TextField } from "@/components/Field";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import {
  budgetProblem,
  buildBudgetItem,
  canBudget,
  emptyBudgetForm,
  fundingAccountsQuery,
  type BudgetAction,
  type BudgetForm,
  type BudgetItem,
} from "./budget";
import { nairobiMonth } from "./status";
import styles from "./Bills.module.css";

// [3.4] Budget items on the Bills & budget screen: pending items wait for Approve; approved ones are set aside.

export function BudgetItemsCard({
  items,
  busy,
  onAction,
}: {
  items: BudgetItem[];
  busy: ReadonlySet<string>;
  onAction: (item: BudgetItem, action: BudgetAction) => void;
}) {
  return (
    <Card title="🗂️ Budget items" aria-label="Budget items">
      <p className={styles.cardHint}>Money moves only after you approve.</p>
      {items.length === 0 ? (
        <p className={styles.status}>No budget items. Plan school fees, repairs or travel here.</p>
      ) : (
        <ul className={styles.budgetList}>
          {items.map((item) => (
            <BudgetLine key={item.id} item={item} busy={busy.has(item.id)} onAction={onAction} />
          ))}
        </ul>
      )}
      <Link to="/bills/budget/new" className={`${styles.addLink} ${styles.phoneOnly}`}>
        ＋ New budget item
      </Link>
    </Card>
  );
}

function BudgetLine({
  item,
  busy,
  onAction,
}: {
  item: BudgetItem;
  busy: boolean;
  onAction: (item: BudgetItem, action: BudgetAction) => void;
}) {
  return (
    <li className={styles.budgetItem}>
      <EmojiTile emoji={item.accountEmoji} size="sm" />
      <div className={styles.budgetText}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.budgetMeta}>
          {formatAmount(item.amount_cents)} · {item.accountEmoji} {item.accountName}
        </span>
      </div>
      <div className={styles.budgetActions}>
        {item.status === "approved" && <span className={styles.approved}>✓ Approved</span>}
        {item.status === "done" && <span className={styles.approved}>✓ Spent</span>}
        {canBudget(item, "cancel") && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Cancel ${item.name}`}
            disabled={busy}
            onClick={() => onAction(item, "cancel")}
          >
            Cancel
          </Button>
        )}
        {canBudget(item, "approve") && (
          <Button
            size="sm"
            aria-label={`Approve ${item.name}`}
            disabled={busy}
            onClick={() => onAction(item, "approve")}
          >
            Approve
          </Button>
        )}
      </div>
    </li>
  );
}

type FundingAccount = { id: string; name: string; emoji: string | null };

/** The new budget item form: the side card on desktop and its own page on phones. */
export function NewBudgetItemForm({ db, now, onSaved }: { db: () => Db; now?: Date; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<FundingAccount[]>([]);
  const [form, setForm] = useState<BudgetForm>(emptyBudgetForm);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void fundingAccountsQuery(db()).then(({ data }) => live && setAccounts(data ?? []));
    return () => {
      live = false;
    };
  }, [db]);

  const set = (patch: Partial<BudgetForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
  };

  async function save() {
    const why = budgetProblem(form);
    if (why) return setError(why);
    setSaving(true);
    const { error } = await db()
      .from("budget_items")
      .insert(buildBudgetItem(form, nairobiMonth(now)));
    setSaving(false);
    if (error) return setError(error.message);
    setForm(emptyBudgetForm());
    onSaved();
  }

  return (
    <form
      aria-label="New budget item"
      className={styles.budgetForm}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField
        label="What for"
        placeholder="e.g. Car service"
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className={styles.formRow}>
        <NumberField
          label="Amount"
          placeholder="KES 0"
          value={form.amount}
          onChange={(e) => set({ amount: e.target.value })}
        />
        <SelectField label="From" value={form.accountId} onChange={(e) => set({ accountId: e.target.value })}>
          <option value="">Choose</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.emoji ? `${a.emoji} ` : ""}
              {a.name}
            </option>
          ))}
        </SelectField>
      </div>
      {error && (
        <p role="alert" className={styles.actionError}>
          {error}
        </p>
      )}
      <Button type="submit" block disabled={saving}>
        {saving ? "Saving…" : "Save for approval"}
      </Button>
    </form>
  );
}

export function NewBudgetItemCard({ db, now, onSaved }: { db: () => Db; now?: Date; onSaved: () => void }) {
  return (
    <Card title="＋ New budget item">
      <NewBudgetItemForm db={db} now={now} onSaved={onSaved} />
    </Card>
  );
}

export function NewBudgetItemScreen({ db = supabase, now }: { db?: () => Db; now?: Date }) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="New budget item" subtitle="Money moves only after you approve" back="/bills" />
      <div className={styles.narrowPage}>
        <Card>
          <NewBudgetItemForm db={db} now={now} onSaved={() => void navigate("/bills")} />
        </Card>
      </div>
    </>
  );
}
