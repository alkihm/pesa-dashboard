import { PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import { StatusPill } from "@/components/StatusPill";
import { useAccounts } from "@/lib/data/accounts";
import { supabase, type Db } from "@/lib/supabase";
import { banner, reconcileRows } from "./reconcile";
import styles from "./Review.module.css";

// [4.1] Review & reconcile: every account's ledger against its latest SMS or count, mismatches in red (R15).
// Fixing a mismatch ([4.2]) and the review status, checklist and history ([4.3]) build on this screen.
export function ReviewScreen({ db = supabase }: { db?: () => Db }) {
  const { accounts, error, reload } = useAccounts(db);
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
                      {r.explanation && <p className={styles.explanation}>⚠ {r.explanation}</p>}
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
