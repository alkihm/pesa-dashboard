import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PageHeader } from "@/app/shell/PageHeader";
import { Card } from "@/components/Card";
import { useCategories } from "@/lib/data/categories";
import { supabase, type Db } from "@/lib/supabase";
import { transactionQuery, type ActivityRow } from "./query";
import { savedMessage, saveTransaction } from "./save";
import { TransactionDetail } from "./TransactionDetail";
import { TransactionRow } from "./TransactionList";
import styles from "./TransactionScreen.module.css";

type Loaded =
  | { status: "loading" }
  | { status: "missing" | "failed"; error?: string }
  | { status: "ok"; row: ActivityRow };

// [2.6] One transaction on its own page, for links from other screens (Month's table). Same editor as Activity.
export function TransactionScreen({ db = supabase }: { db?: () => Db }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { categories } = useCategories(db);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [saved, setSaved] = useState<string>();

  useEffect(() => {
    let live = true;
    void transactionQuery(db(), id).then(({ data, error }) => {
      if (!live) return;
      if (error) setLoaded({ status: "failed", error: error.message });
      else setLoaded(data ? { status: "ok", row: data } : { status: "missing" });
    });
    return () => {
      live = false;
    };
  }, [db, id]);

  return (
    <>
      <PageHeader title="Transaction" back="/activity" />
      <div className={styles.page}>
        {loaded.status === "loading" && <p className={styles.status}>Loading…</p>}
        {loaded.status === "failed" && (
          <p role="alert" className={styles.status}>
            Could not load this transaction: {loaded.error}
          </p>
        )}
        {loaded.status === "missing" && (
          <Card title="Transaction not found">
            <p className={styles.status}>
              It may have been deleted. <Link to="/activity">Back to Activity</Link>
            </p>
          </Card>
        )}
        {loaded.status === "ok" && (
          <>
            {saved && (
              <p role="status" className={styles.saved}>
                ✓ {saved}
              </p>
            )}
            <TransactionRow row={loaded.row} open>
              <TransactionDetail
                key={`${loaded.row.id}:${loaded.row.version}`}
                row={loaded.row}
                categories={categories}
                onSave={async (changes) => {
                  const result = await saveTransaction(db(), loaded.row, changes);
                  setLoaded({ status: "ok", row: result.row });
                  setSaved(savedMessage(result));
                }}
                onCancel={() => void navigate(-1)}
              />
            </TransactionRow>
          </>
        )}
      </div>
    </>
  );
}
