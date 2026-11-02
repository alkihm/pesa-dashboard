import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/app/shell/PageHeader";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { supabase, type Db } from "@/lib/supabase";
import { CategorySummary } from "./CategorySummary";
import type { ActivityFilter } from "./query";
import { useActivitySummary } from "./summary";
import { TransactionList, TransactionTable } from "./TransactionList";
import { useActivity } from "./useActivity";
import styles from "./ActivityScreen.module.css";

const count = new Intl.NumberFormat("en-KE");

// [2.5] Activity: every transaction, newest first, with filters and search. Phones get cards, desktop a table.
export function ActivityScreen({ db = supabase }: { db?: () => Db }) {
  const activity = useActivity(db);
  const summary = useActivitySummary(db);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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

          <div className={styles.phoneOnly}>
            <TransactionList rows={activity.rows} />
          </div>
          <div className={styles.desktopOnly}>
            <TransactionTable rows={activity.rows} />
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
