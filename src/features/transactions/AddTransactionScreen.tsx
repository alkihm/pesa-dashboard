import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { NumberField, TextField } from "@/components/Field";
import { Segmented } from "@/components/Segmented";
import { formatKes } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { insertRows, useAddTransactionData, type AccountOption, type PendingSms } from "./data";
import {
  amountCents,
  buildRows,
  emptyForm,
  fillFromSms,
  formFromParams,
  problem,
  type Direction,
  type Form,
} from "./form";
import styles from "./AddTransactionScreen.module.css";

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "out", label: "↑ Money out" },
  { value: "in", label: "↓ Money in" },
  { value: "transfer", label: "⇄ Transfer" },
];

const pendingTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Nairobi",
});

// [2.7] Add transaction: anything the SMS feed missed, typed in or filled from a pasted SMS. Saved rows are `manual`.
export function AddTransactionScreen({ db = supabase }: { db?: () => Db }) {
  const navigate = useNavigate();
  const data = useAddTransactionData(db);
  // A link can start the form filled in, e.g. Review's "Add missing transaction" ([4.2]), and say where back goes.
  const [params] = useSearchParams();
  const backParam = params.get("back") ?? "";
  const back = /^\/(?!\/)/.test(backParam) ? backParam : "/"; // in-app paths only, never "//other.site"
  const [form, setForm] = useState<Form>(() => formFromParams(params));
  const [paste, setPaste] = useState("");
  const [readMessage, setReadMessage] = useState<{ text: string; ok: boolean }>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ text: string; queued: boolean }>();

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(undefined);
  };
  const lookups = { accounts: data.accounts ?? [], categories: data.categories ?? [], rules: data.rules };
  const kind = form.direction === "in" ? "income" : "spending";
  const categories = data.categories?.filter((c) => c.kind === kind) ?? [];

  function fill(body: string, from?: PendingSms) {
    const result = fillFromSms(body, lookups, { sender: from?.sender, smsId: from?.id });
    if (result.form) setForm(result.form);
    setReadMessage(
      result.ok
        ? { text: "Filled from the SMS. Check it, then save.", ok: true }
        : { text: result.reason, ok: false },
    );
    setError(undefined);
    setSaved(undefined);
  }

  async function save() {
    const why = problem(form);
    if (why) return setError(why);
    setSaving(true);
    try {
      const cents = amountCents(form.amount)!;
      const who = form.payee.trim();
      const text = `${formatKes(cents)}${who ? ` · ${who}` : ""}`;
      const { queued } = await insertRows(db(), buildRows(form), `Added · ${text}`);
      setSaved({ text, queued });
      if (form.sms?.smsId) data.reloadPending();
      // Keep the direction and account for the next entry; clear the rest.
      setForm({ ...emptyForm(new Date(), form.direction), accountId: form.accountId });
      setPaste("");
      setReadMessage(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const fromLabel = form.direction === "in" ? "To account" : "From account";

  return (
    <>
      <PageHeader
        title="Add transaction"
        subtitle="For anything the SMS feed missed"
        back={back}
        controls={
          <Segmented
            label="Direction"
            options={DIRECTIONS}
            value={form.direction}
            onChange={(direction) => set({ direction, categoryId: null })}
          />
        }
      />

      <div className={styles.page}>
        <form
          className={styles.main}
          aria-label="New transaction"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {saved && (
            <p role="status" className={styles.saved}>
              {saved.queued ? (
                <>✓ Saved {saved.text} on this device. It is sent when you are back online.</>
              ) : (
                <>
                  ✓ Saved {saved.text}. <Link to="/activity">See it in Activity</Link>
                </>
              )}
            </p>
          )}

          <Card>
            <div className={styles.form}>
              <div className={styles.row}>
                <NumberField
                  label="Amount (KES)"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                  className={styles.amount}
                />
                <TextField
                  label="Date"
                  type="date"
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              </div>

              <AccountTiles
                label={fromLabel}
                accounts={data.accounts}
                value={form.accountId}
                onChange={(accountId) => set({ accountId })}
              />
              {form.direction === "transfer" && (
                <AccountTiles
                  label="To account"
                  accounts={data.accounts?.filter((a) => a.id !== form.accountId)}
                  value={form.toAccountId}
                  onChange={(toAccountId) => set({ toAccountId })}
                />
              )}

              {form.direction !== "transfer" && (
                <div role="group" aria-label="Category" className={styles.group}>
                  <span className={styles.label}>Category</span>
                  <div className={styles.chips}>
                    {categories.map((c) => (
                      <Chip
                        key={c.id}
                        selected={c.id === form.categoryId}
                        onClick={() => set({ categoryId: c.id === form.categoryId ? null : c.id })}
                      >
                        <span aria-hidden="true">{c.emoji ?? "🏷️"}</span> {c.name}
                      </Chip>
                    ))}
                    <Link to="/categories/new" className={styles.newCategory}>
                      + New category
                    </Link>
                  </div>
                </div>
              )}

              <div className={styles.row}>
                {form.direction !== "transfer" && (
                  <TextField
                    label={form.direction === "in" ? "Received from" : "Paid to"}
                    placeholder={form.direction === "in" ? "e.g. Employer" : "e.g. NAIVAS"}
                    value={form.payee}
                    onChange={(e) => set({ payee: e.target.value })}
                  />
                )}
                <TextField
                  label="📝 Note · optional"
                  placeholder="Why or what for"
                  value={form.note}
                  onChange={(e) => set({ note: e.target.value })}
                />
              </div>

              {form.sms && form.sms.fees.length > 0 && (
                <p className={styles.hint}>
                  The SMS also charged {formatKes(-form.sms.fees.reduce((sum, f) => sum + f.amount_cents, 0))}{" "}
                  in fees; they are saved as their own row.
                </p>
              )}
              {!form.categoryId && form.direction !== "transfer" && (
                <p className={styles.hint}>Without a category it is saved to review later.</p>
              )}

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
                  {saving ? "Saving…" : "Save transaction"}
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <aside className={styles.side}>
          <Card title="📩 Paste an SMS">
            <div className={styles.paste}>
              <textarea
                aria-label="SMS text"
                placeholder="Paste an M-PESA, Airtel or KCB message"
                rows={4}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                className={styles.textarea}
              />
              <Button variant="secondary" block disabled={!paste.trim()} onClick={() => fill(paste)}>
                Read SMS and fill the form
              </Button>
              {readMessage && (
                <p role="status" className={readMessage.ok ? styles.readOk : styles.readWarn}>
                  {readMessage.text}
                </p>
              )}
            </div>
          </Card>

          {data.pending && data.pending.length > 0 && (
            <Card title="Not yet in the ledger" className={styles.pendingCard}>
              <p className={styles.hint}>SMS that reached the server but could not be read automatically.</p>
              <ul className={styles.pending}>
                {data.pending.map((p) => (
                  <li key={p.id} className={styles.pendingItem}>
                    <div className={styles.pendingText}>
                      <span className={styles.pendingHead}>
                        {p.sender} · {pendingTime.format(new Date(p.received_at))}
                      </span>
                      <span>{p.body}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Use the SMS from ${p.sender}`}
                      onClick={() => fill(p.body, p)}
                    >
                      Use
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

interface TilesProps {
  label: string;
  accounts?: AccountOption[];
  value: string | null;
  onChange: (id: string) => void;
}

function AccountTiles({ label, accounts, value, onChange }: TilesProps) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      <span className={styles.label}>{label}</span>
      <div className={styles.tiles}>
        {accounts?.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={a.id === value}
            className={styles.tile}
            onClick={() => onChange(a.id)}
          >
            <span aria-hidden="true" className={styles.tileEmoji}>
              {a.emoji ?? "🏦"}
            </span>
            <span className={styles.tileName}>{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
