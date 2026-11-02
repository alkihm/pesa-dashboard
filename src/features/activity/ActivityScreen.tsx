import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/app/shell/PageHeader";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { useCategories } from "@/lib/data/categories";
import { supabase, type Db } from "@/lib/supabase";
import { CategorySummary } from "./CategorySummary";
import type { ActivityFilter, ActivityRow } from "./query";
import { savedMessage, saveTransaction, type Changes } from "./save";
import { useActivitySummary } from "./summary";
import { TransactionDetail } from "./TransactionDetail";
import { TransactionList, TransactionTable } from "./TransactionList";
import { useActivity } from "./useActivity";
import styles from "./ActivityScreen.module.css";

const count = new Intl.NumberFormat("en-KE");
const TOAST_MS = 5000;

// [2.5] Activity: every transaction, newest first, with filters and search. Phones get cards, desktop a table.
// [2.6] A row opens for editing: inside the list on phones, under the table on desktop.
export function ActivityScreen({ db = supabase }: { db?: () => Db }) {
  const activity = useActivity(db);
  const summary = useActivitySummary(db);
  const { categories } = useCategories(db);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openId, setOpenId] = useState<string>();
  const [toast, setToast] = useState<{ text: string; error?: boolean }>();
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activity.rows.find((r) => r.id === openId);

  // The desktop panel sits under a table of up to hundreds of rows: bring it into view when a row opens.
  useEffect(() => {
    if (openId) panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [openId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = (id: string) => setOpenId((current) => (current === id ? undefined : id));

  async function save(row: ActivityRow, changes: Changes) {
    const saved = await saveTransaction(db(), row, changes);
    // A rule may have changed rows anywhere in the list, so then the list starts again.
    if (saved.applied) activity.reload();
    else activity.replaceRow(saved.row);
    summary.reload();
    setOpenId(undefined);
    setToast({ text: savedMessage(saved) });
  }

  function pickCategory(row: ActivityRow, categoryId: string) {
    save(row, { categoryId, note: row.note ?? "", always: false }).catch((e: unknown) =>
      setToast({ text: e instanceof Error ? e.message : String(e), error: true }),
    );
  }

  const detail = (row: ActivityRow, showCategories: boolean) => (
    <TransactionDetail
      key={`${row.id}:${row.version}`}
      row={row}
      categories={categories}
      showCategories={showCategories}
      onSave={(changes) => save(row, changes)}
      onCancel={() => setOpenId(undefined)}
    />
  );

  const reviewCount = summary.reviewCount ? ` ${count.format(summary.reviewCount)}` : "";
  const filters: { value: ActivityFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "review", label: `❓ Review${reviewCount}` },
    { value: "notes", label: "📝 Notes" },
  ];

  function toggleSearch() {
    const open = !searchOpen;
    setSearchOpen(open);
    if (open) setTimeout(() => searchRef.current?.focus());
    else activity.setSearch("");
  }

  const filterProps = {
    label: "Filter",
    options: filters,
    value: activity.filter,
    onChange: activity.setFilter,
  };
  const addLink = (
    <Link to="/transactions/new" aria-label="Add transaction" className={styles.add}>
      <Icon name="plus" size={20} />
      <span className={styles.desktopOnly}>Add</span>
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Activity"
        leading={
          <button
            type="button"
            aria-label="Search"
            aria-expanded={searchOpen}
            className={styles.headerButton}
            onClick={toggleSearch}
          >
            <Icon name="search" />
          </button>
        }
        trailing={addLink}
        controls={
          <div className={styles.phoneOnly}>
            <Segmented {...filterProps} />
          </div>
        }
        actions={addLink}
      />

      <div className={styles.page}>
        <section aria-labelledby="activity-heading" className={styles.transactions}>
          <div className={styles.toolbar}>
            <h2 id="activity-heading" className={styles.heading}>
              Transactions
            </h2>
            <input
              ref={searchRef}
              type="search"
              aria-label="Search payee, note or amount"
              placeholder="Search payee, note or amount"
              value={activity.search}
              onChange={(e) => activity.setSearch(e.target.value)}
              className={
                searchOpen || activity.search ? `${styles.search} ${styles.searchOpen}` : styles.search
              }
            />
            <div className={styles.desktopOnly}>
              <Segmented {...filterProps} variant="surface" />
            </div>
          </div>

          {activity.error && (
            <p role="alert" className={styles.status}>
              Could not load transactions: {activity.error}
            </p>
          )}
          {!activity.error && !activity.loading && activity.rows.length === 0 && (
            <p className={styles.status}>
              {activity.search ? "Nothing matches that search." : "No transactions here yet."}
            </p>
          )}

          {toast && (
            <p role={toast.error ? "alert" : "status"} className={toast.error ? styles.failed : styles.saved}>
              {toast.error ? toast.text : `✓ ${toast.text}`}
            </p>
          )}

          <div className={styles.phoneOnly}>
            <TransactionList
              rows={activity.rows}
              openId={openId}
              onToggle={toggle}
              renderOpen={(row) => detail(row, true)}
            />
          </div>
          <div className={styles.desktopOnly}>
            <TransactionTable
              rows={activity.rows}
              openId={openId}
              onToggle={toggle}
              categories={categories}
              onCategory={pickCategory}
            />
            {open && (
              <div ref={panelRef} className={styles.panel}>
                <p className={styles.panelTitle}>{open.payee || open.account.name}</p>
                {detail(open, false)}
              </div>
            )}
          </div>

          <MoreRows hasMore={activity.hasMore} loading={activity.loading} onMore={activity.loadMore} />
        </section>

        <aside className={styles.side}>
          <CategorySummary month={summary.month} totals={summary.byCategory} />
        </aside>
      </div>
    </>
  );
}

/** Loads the next page when the end of the list scrolls into view; the button is there for keyboards and old browsers. */
function MoreRows({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMore(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onMore]);

  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} className={styles.more}>
      {loading ? (
        <span className={styles.status}>Loading…</span>
      ) : (
        <button type="button" className={styles.moreButton} onClick={onMore}>
          Show more
        </button>
      )}
    </div>
  );
}
