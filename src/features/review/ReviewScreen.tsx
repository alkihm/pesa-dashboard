import { useState } from "react";
import { Link } from "react-router";

import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import { TextField } from "@/components/Field";
import { StatusPill } from "@/components/StatusPill";
import { useAccounts } from "@/lib/data/accounts";
import { formatDay, nairobiToday } from "@/lib/due";
import { formatAmount } from "@/lib/money";
import { addDays, reviewBands, reviewHistory, reviewStatus, type ReviewResult } from "@/lib/review";
import { supabase, type Db } from "@/lib/supabase";
import { checklist, markReviewed, useReviewData } from "./data";
import { missingTransactionLink, reasonProblem, saveAdjustment } from "./fix";
import { banner, reconcileRows, type ReconcileRow } from "./reconcile";
import { useReviewStatus } from "./statusContext";
import styles from "./Review.module.css";

const STATUS_ICON = { green: "✓", amber: "◷", red: "!" };
const TONE_CLASS = { green: styles.green, amber: styles.amber, red: styles.red };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// [4.1] Review & reconcile: every account's ledger against its latest SMS or count, mismatches in red (R15).
// [4.2] Each mismatch can be fixed without editing history. [4.3] The review status (green, amber, red against the
// interval from Settings), the checklist with Mark reviewed, and the history of past reviews.
export function ReviewScreen({ db = supabase }: { db?: () => Db }) {
  const { accounts, error, reload } = useAccounts(db);
  const review = useReviewData(db);
  const shared = useReviewStatus();
  const [toast, setToast] = useState<string>();
  const [adjusted, setAdjusted] = useState<ReadonlySet<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string>();

  const rows = reconcileRows(accounts ?? []);
  const top = banner(rows);
  const mismatches = rows.filter((r) => r.state === "mismatch").length;
  const interval = review.data?.interval;
  const records = review.data?.records ?? [];
  const status = reviewStatus({
    lastReviewedAt: records[0]?.completedAt ?? null,
    intervalDays: interval,
    mismatches,
  });
  const bands = reviewBands(interval);
  const ready = !!accounts && !!review.data;

  function refreshAll() {
    reload();
    review.reload();
    shared?.refresh();
  }

  async function mark() {
    setMarking(true);
    setMarkError(undefined);
    try {
      const result = await markReviewed(db(), rows, adjusted);
      setToast(savedText(result, mismatches, addDays(nairobiToday(), status.interval)));
      setAdjusted(new Set());
      refreshAll();
    } catch (e) {
      setMarkError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Review & reconcile"
        phoneTitle="Review"
        subtitle={
          ready
            ? `${status.last} · reminder every ${plural(status.interval, "day")}`
            : "Ledger against each account's latest SMS"
        }
        back="/"
        trailing={
          <button type="button" className={styles.refresh} onClick={refreshAll} aria-label="Refresh balances">
            <span aria-hidden="true">↻</span>
          </button>
        }
        actions={
          <button type="button" className={styles.headerButton} onClick={refreshAll}>
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
        {review.error && (
          <p role="alert" className={styles.status}>
            Could not load the review: {review.error}
          </p>
        )}
        {!accounts && !error && <p className={styles.status}>Loading…</p>}

        {accounts && (
          <>
            {toast && (
              <p role="status" className={styles.toast}>
                {toast}
              </p>
            )}

            <section aria-label="Review status" className={`${styles.banner} ${TONE_CLASS[status.tone]}`}>
              <span className={styles.bannerMain}>
                <span aria-hidden="true" className={styles.bannerIcon}>
                  {STATUS_ICON[status.tone]}
                </span>
                <span>
                  <span className={styles.bannerTitle}>{status.title}</span>
                  <span className={styles.bannerText}>{mismatches ? top.text : status.text}</span>
                </span>
              </span>
              <ul className={styles.bands} aria-label="Status colours">
                <li className={styles.green}>{bands.green}</li>
                <li className={styles.amber}>{bands.amber}</li>
                <li className={styles.red}>{bands.red}</li>
              </ul>
            </section>

            <div className={styles.columns}>
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
                              setToast(text);
                              setAdjusted((s) => new Set(s).add(r.account.account_id));
                              reload();
                              shared?.refresh();
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

              <div className={styles.side}>
                <Card title="Checklist">
                  {review.data && (
                    <ul className={styles.checks}>
                      {checklist(mismatches, review.data).map((k) => (
                        <li key={k.key} className={styles.check}>
                          <span aria-hidden="true">
                            {k.done ? "✅" : k.key === "categories" ? "❓" : "⚠️"}
                          </span>
                          <span className={styles.checkText}>{k.text}</span>
                          {k.fix && (
                            <Link to={k.fix} className={styles.fixLink} aria-label={`Fix: ${k.text}`}>
                              Fix
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {markError && (
                    <p role="alert" className={styles.markError}>
                      Could not save the review: {markError}
                    </p>
                  )}
                  <Button block onClick={() => void mark()} disabled={!ready || marking}>
                    {marking
                      ? "Saving…"
                      : mismatches
                        ? `Mark reviewed · ${mismatches} left open`
                        : "Mark reviewed"}
                  </Button>
                </Card>

                <Card title="History">
                  {review.data &&
                    (records.length ? (
                      <ul className={styles.history}>
                        {reviewHistory(records, interval).map((h) => (
                          <li key={h.id} className={styles.historyRow}>
                            <span
                              aria-hidden="true"
                              className={`${styles.historyDot} ${TONE_CLASS[h.tone]}`}
                            />
                            <span className={styles.historyDay}>{h.day}</span>
                            <span className={styles.muted}>{h.note}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.status}>No reviews yet. Mark the first one above.</p>
                    ))}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function savedText(result: ReviewResult, open: number, next: string): string {
  if (result === "left_open")
    return `Review saved with ${open === 1 ? "1 account" : `${open} accounts`} left open. Fix ${open === 1 ? "it" : "them"} to turn the status green.`;
  return `Review saved${result === "fixed" ? " with your fixes" : ""}. Next review ${formatDay(next)}.`;
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
