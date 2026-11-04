import { useState } from "react";
import { Link } from "react-router";

import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import { TextField } from "@/components/Field";
import { StatusPill } from "@/components/StatusPill";
import { useAccounts } from "@/lib/data/accounts";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { missingTransactionLink, reasonProblem, saveAdjustment } from "./fix";
import { banner, reconcileRows, type ReconcileRow } from "./reconcile";
import styles from "./Review.module.css";

// [4.1] Review & reconcile: every account's ledger against its latest SMS or count, mismatches in red (R15).
// [4.2] Each mismatch can be fixed without editing history. The review status, checklist and history ([4.3]) build
// on this screen.
export function ReviewScreen({ db = supabase }: { db?: () => Db }) {
  const { accounts, error, reload } = useAccounts(db);
  const [fixed, setFixed] = useState<string>();
  const rows = reconcileRows(accounts ?? []);
  const top = banner(rows);

  return (
    <>
      <PageHeader
        title="Review & reconcile"
        phoneTitle="Review"
        subtitle="Ledger against each account's latest SMS"
        back="/"
        trailing={
          <button type="button" className={styles.refresh} onClick={reload} aria-label="Refresh balances">
            <span aria-hidden="true">↻</span>
          </button>
        }
        actions={
          <button type="button" className={styles.headerButton} onClick={reload}>
            🔄 Refresh
          </button>
        }
      />

      <div className={styles.page}>
        {error && (
          <p role="alert" className={styles.status}>
            Could not load accounts: {error}
          </p>
        )}
        {!accounts && !error && <p className={styles.status}>Loading…</p>}

        {accounts && (
          <>
            {fixed && (
              <p role="status" className={styles.toast}>
                {fixed}
              </p>
            )}

            <section
              aria-label="Status"
              className={`${styles.banner} ${top.tone === "red" ? styles.bannerRed : styles.bannerGreen}`}
            >
              <span aria-hidden="true" className={styles.bannerIcon}>
                {top.tone === "red" ? "!" : "✓"}
              </span>
              <span>
                <span className={styles.bannerTitle}>{top.title}</span>
                <span className={styles.bannerText}>{top.text}</span>
              </span>
            </section>

            <Card title="Ledger vs latest SMS balance" className={styles.ledger}>
              {rows.length ? (
                <ul className={styles.rows}>
                  {rows.map((r) => (
                    <li key={r.account.account_id} className={styles.row}>
                      <span className={styles.rowTop}>
                        <EmojiTile emoji={r.account.emoji ?? "💰"} />
                        <span className={styles.rowText}>
                          <span className={styles.name}>{r.account.name}</span>
                          <span className={styles.muted}>{r.detail}</span>
                        </span>
                        <StatusPill tone={r.pill.tone}>{r.pill.text}</StatusPill>
                      </span>
                      {r.state === "mismatch" && (
                        <FixPanel
                          row={r}
                          db={db}
                          onFixed={(text) => {
                            setFixed(text);
                            reload();
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.status}>No accounts yet.</p>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

/** Under a mismatch: the explanation, then add the missing transaction or adjust the balance with a reason. */
function FixPanel({
  row,
  db,
  onFixed,
}: {
  row: ReconcileRow;
  db: () => Db;
  onFixed: (text: string) => void;
}) {
  const a = row.account;
  const [adjusting, setAdjusting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const amount = formatAmount(a.difference_cents ?? 0, { signed: true });

  async function save() {
    const why = reasonProblem(reason);
    if (why) return setError(why);
    setSaving(true);
    try {
      await saveAdjustment(db(), a, reason);
      onFixed(`Adjusted ${a.name} by ${amount}: “${reason.trim()}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className={styles.fix}>
      <p className={styles.explanation}>⚠ {row.explanation}</p>
      {!adjusting ? (
        <div className={styles.fixActions}>
          <Link to={missingTransactionLink(a)} className={styles.addMissing}>
            ＋ Add missing transaction
          </Link>
          <Button variant="ghost" onClick={() => setAdjusting(true)}>
            ✏️ Adjust balance
          </Button>
        </div>
      ) : (
        <form
          className={styles.adjust}
          aria-label={`Adjust ${a.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className={styles.muted}>
            Adds an adjustment of <b>{amount}</b> at the {a.snapshot_source === "manual" ? "count" : "SMS"}
            &apos;s time, so the ledger matches. History is not changed; the adjustment and its reason stay in
            Activity.
          </p>
          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(undefined);
            }}
            error={error}
            placeholder="e.g. Counted cash, 100 missing"
            autoFocus
          />
          <div className={styles.fixActions}>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : `Save adjustment ${amount}`}
            </Button>
            <Button variant="ghost" onClick={() => setAdjusting(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
