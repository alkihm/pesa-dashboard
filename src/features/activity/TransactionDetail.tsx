// [2.6] One transaction opened: the SMS it came from, its category, a note, and "always for this payee".
// Phones show it inside the list; desktop shows it under the table (the category is picked in the table there).

import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import type { Category } from "@/lib/data/categories";
import { canCategorise } from "./format";
import type { ActivityRow } from "./query";
import type { Changes } from "./save";
import styles from "./TransactionDetail.module.css";

const smsTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Nairobi",
});

const NO_SMS: Record<string, string> = {
  manual: "Added by hand, so there is no SMS.",
  import: "Imported from the old ledgers, so there is no SMS.",
};

interface TransactionDetailProps {
  row: ActivityRow;
  categories?: Category[];
  /** False on desktop, where the table has the category menu. */
  showCategories?: boolean;
  onSave: (changes: Changes) => Promise<void>;
  onCancel?: () => void;
}

export function TransactionDetail({
  row,
  categories,
  showCategories = true,
  onSave,
  onCancel,
}: TransactionDetailProps) {
  const [categoryId, setCategoryId] = useState(row.category?.id ?? null);
  const [note, setNote] = useState(row.note ?? "");
  const [always, setAlways] = useState(row.needs_review && !!row.payee);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const categorise = canCategorise(row);
  const choices = categories?.filter((c) => c.kind === row.kind) ?? [];
  const payee = row.payee?.trim();

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await onSave({ categoryId, note, always: categorise && always && !!payee && !!categoryId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className={styles.detail}>
      {row.sms ? (
        <div className={styles.sms}>
          <div className={styles.smsHead}>
            <span>📩 SMS from {row.sms.sender}</span>
            <span>{smsTime.format(new Date(row.sms.received_at))}</span>
          </div>
          <p className={styles.smsBody}>{row.sms.body}</p>
        </div>
      ) : (
        <p className={styles.noSms}>{NO_SMS[row.source] ?? "No SMS is kept for this transaction."}</p>
      )}

      {categorise && showCategories && (
        <div role="group" aria-label="Category" className={styles.chips}>
          {choices.map((c) => (
            <Chip key={c.id} selected={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
              <span aria-hidden="true">{c.emoji ?? "🏷️"}</span> {c.name}
            </Chip>
          ))}
          <Link to="/categories/new" className={styles.newCategory}>
            + New
          </Link>
        </div>
      )}

      {categorise && payee && (
        <label className={styles.always}>
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
          <span>
            Always for <strong>{payee}</strong>
          </span>
        </label>
      )}

      <input
        type="text"
        aria-label="Note"
        placeholder="📝 Add a note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={styles.note}
      />

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {onCancel && (
          <Button variant="ghost" block onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button block onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
