import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { HeaderIconLink, PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { monthName } from "@/features/month/month";
import { categoryColourVar } from "@/lib/categoryColours";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { categoryRows, rulesText, type CategoryRow, type Kind } from "./category";
import { CategoryForm } from "./CategoryForm";
import { savedMessage, setArchived, useCategoryData } from "./data";
import styles from "./Categories.module.css";

const TOAST_MS = 5000;

function useToast() {
  // A save on the category's own page comes back here with its message.
  const arrived = (useLocation().state as { toast?: string } | null)?.toast;
  const [toast, setToast] = useState<{ text: string; error?: boolean } | undefined>(
    arrived ? { text: arrived } : undefined,
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast && (
    <p role={toast.error ? "alert" : "status"} className={toast.error ? styles.toastError : styles.toast}>
      {toast.text}
    </p>
  );
  return { setToast, node };
}

// [2.8] Categories: spending and income tabs, this month's total and budget bar per category, archived ones to
// restore. Desktop has the new-category form beside the list; phones open it on its own page.
export function CategoriesScreen({ db = supabase, now }: { db?: () => Db; now?: Date }) {
  const { month, data, error, reload } = useCategoryData(db, now);
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get("kind") === "income" ? "income" : "spending";
  const { setToast, node: toast } = useToast();

  const rows = useMemo(
    () => (data ? categoryRows(data.categories, data.totals, data.rules, kind) : []),
    [data, kind],
  );
  const count = (k: Kind) => data?.categories.filter((c) => c.kind === k && !c.archived_at).length ?? 0;
  const archived = data?.categories.filter((c) => c.kind === kind && c.archived_at) ?? [];
  const total = rows.reduce((sum, r) => sum + r.cents, 0);
  const tabs = [
    { value: "spending" as const, label: `🛒 Spending · ${count("spending")}` },
    { value: "income" as const, label: `💰 Income · ${count("income")}` },
  ];
  const subtitle =
    kind === "spending"
      ? `${monthName(month)} · ${formatAmount(total)} spent across ${rows.length} categories`
      : `${monthName(month)} · ${formatAmount(total)} in`;

  async function restore(id: string) {
    const category = data?.categories.find((c) => c.id === id);
    if (!category) return;
    try {
      await setArchived(db(), category, false);
      setToast({ text: `Restored ${category.name}.` });
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
    reload();
  }

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle={data ? subtitle : undefined}
        back="/"
        trailing={
          <HeaderIconLink to={`/categories/new?kind=${kind}`} label="New category">
            <Icon name="plus" />
          </HeaderIconLink>
        }
        controls={
          <Segmented
            label="Type"
            options={tabs}
            value={kind}
            onChange={(k) => setParams(k === "income" ? { kind: k } : {}, { replace: true })}
          />
        }
      />

      <div className={styles.page}>
        {error && (
          <p role="alert" className={styles.status}>
            Could not load categories: {error}
          </p>
        )}
        {toast}

        <div className={styles.layout}>
          <section aria-label="Category list" className={styles.list}>
            {data && rows.length === 0 && <p className={styles.status}>No {kind} categories yet.</p>}
            {rows.map((row) => (
              <CategoryCard key={row.category.id} row={row} />
            ))}
            <Link to={`/categories/new?kind=${kind}`} className={`${styles.newLink} ${styles.phoneOnly}`}>
              ＋ New category
            </Link>

            {archived.length > 0 && (
              <details className={styles.archived}>
                <summary>Archived · {archived.length}</summary>
                <ul>
                  {archived.map((c) => (
                    <li key={c.id}>
                      <span>
                        <span aria-hidden="true">{c.emoji ?? "🏷️"}</span> {c.name}
                      </span>
                      <button type="button" className={styles.restore} onClick={() => restore(c.id)}>
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <aside className={styles.desktopOnly}>
            <Card title="＋ New category">
              {data && (
                <CategoryForm
                  key={kind}
                  data={data}
                  db={db}
                  kind={kind}
                  onSaved={(name, result) => {
                    setToast({ text: savedMessage(name, result) });
                    reload();
                  }}
                />
              )}
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}

function CategoryCard({ row }: { row: CategoryRow }) {
  const { category, cents, rules, budget } = row;
  const budgetText = category.monthly_budget_cents
    ? `Budget ${formatAmount(category.monthly_budget_cents)}`
    : null;
  const bar =
    budget.tone === "over"
      ? "var(--tone-red-dot)"
      : budget.tone === "near"
        ? "var(--tone-amber-dot)"
        : categoryColourVar(category.colour);

  return (
    <Link to={`/categories/${category.id}`} className={styles.card}>
      <span className={styles.cardTop}>
        <EmojiTile emoji={category.emoji ?? "🏷️"} colour={category.colour} />
        <span className={styles.cardText}>
          <span className={styles.cardName}>{category.name}</span>
          <span className={styles.muted}>
            {budgetText && <span className={styles.phoneBudget}>{budgetText} · </span>}
            {rulesText(rules)}
          </span>
        </span>
        <span className={styles.cardAmount}>{formatAmount(cents)}</span>
      </span>
      {budget.tone !== "none" && (
        <span
          className={styles.track}
          role="meter"
          aria-label={`${category.name} budget used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(budget.fill * 100)}
        >
          <span style={{ width: `${budget.fill * 100}%`, background: bar }} />
        </span>
      )}
      <span className={`${styles.status} ${styles[budget.tone]}`}>{budget.text}</span>
    </Link>
  );
}

// /categories/new and /categories/:id: the form on its own page (phones, and editing on desktop).
export function CategoryScreen({ db = supabase }: { db?: () => Db }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data, error } = useCategoryData(db);
  const existing = id ? data?.categories.find((c) => c.id === id) : undefined;
  const kind: Kind = params.get("kind") === "income" ? "income" : "spending";
  const back = `/categories${(existing?.kind ?? kind) === "income" ? "?kind=income" : ""}`;
  const notFound = id && data && !existing;

  return (
    <>
      <PageHeader title={id ? (existing?.name ?? "Category") : "New category"} back={back} />
      <div className={`${styles.page} ${styles.narrow}`}>
        {error && (
          <p role="alert" className={styles.status}>
            Could not load categories: {error}
          </p>
        )}
        {notFound && <p className={styles.status}>This category does not exist.</p>}
        {data && (!id || existing) && (
          <Card>
            <CategoryForm
              key={existing ? `${existing.id}:${existing.version}` : kind}
              data={data}
              db={db}
              existing={existing}
              kind={kind}
              onSaved={(name, result) => navigate(back, { state: { toast: savedMessage(name, result) } })}
              onArchived={(archived) =>
                navigate(back, {
                  state: { toast: `${archived ? "Archived" : "Restored"} ${existing?.name ?? "category"}.` },
                })
              }
            />
          </Card>
        )}
      </div>
    </>
  );
}
