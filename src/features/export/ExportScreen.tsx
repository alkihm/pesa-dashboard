import { useState } from "react";

import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { supabase, type Db } from "@/lib/supabase";
import { buildExport, type ExportProgress, type Manifest } from "./export";
import { EXPORT_TABLES } from "./tables";
import styles from "./Export.module.css";

const LABELS: Record<string, string> = {
  accounts: "Accounts",
  categories: "Categories",
  payee_rules: "Payee rules",
  import_batches: "Imports",
  sms_messages: "SMS messages",
  bills: "Bills",
  budget_items: "Budget items",
  transactions: "Transactions",
  balance_snapshots: "Balance readings",
  bill_months: "Bill months",
  reviews: "Reviews",
  review_checks: "Review checks",
  settings: "Settings",
};

const count = (n: number) => n.toLocaleString("en-US");

/** Hands the file to the browser as a download. */
function save(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type State =
  | { step: "idle" }
  | { step: "reading"; progress?: ExportProgress }
  | { step: "done"; manifest: Manifest; fileName: string }
  | { step: "error"; message: string };

// [4.10] Export everything: every table as CSV in one ZIP, all years, to keep or to restore from. Settings links
// here ([4.9]); the files are made in the browser from the signed-in user's own rows.
export function ExportScreen({
  db = supabase,
  download = save,
}: {
  db?: () => Db;
  download?: (bytes: Uint8Array, fileName: string) => void;
}) {
  const [state, setState] = useState<State>({ step: "idle" });

  async function run() {
    setState({ step: "reading" });
    try {
      const out = await buildExport(db(), new Date(), (progress) => setState({ step: "reading", progress }));
      download(out.bytes, out.fileName);
      setState({ step: "done", manifest: out.manifest, fileName: out.fileName });
    } catch (e) {
      setState({ step: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const total = state.step === "done" ? Object.values(state.manifest.tables).reduce((t, n) => t + n, 0) : 0;

  return (
    <>
      <PageHeader
        title="Export everything"
        phoneTitle="Export"
        subtitle="All years as CSV"
        back="/settings"
      />
      <div className={styles.page}>
        <Card title="🗃️ Everything, as CSV">
          <p className={styles.text}>
            Every account, category, transaction, SMS, bill, budget item and review — all years — as one CSV
            file per table, in a single .zip. Keep it as a backup, open it in a spreadsheet, or restore from
            it.
          </p>
          <p className={styles.muted}>
            Includes a readable transactions file with names and KES amounts. The PIN and device keys are not
            included.
          </p>

          {state.step === "reading" && (
            <p role="status" className={styles.progress}>
              Reading {state.progress ? LABELS[state.progress.table] : "…"}
              {state.progress && state.progress.rows > 0 ? ` · ${count(state.progress.rows)} rows` : ""}
            </p>
          )}
          {state.step === "error" && (
            <p role="alert" className={styles.error}>
              Could not export: {state.message}
            </p>
          )}

          <Button block onClick={() => void run()} disabled={state.step === "reading"}>
            {state.step === "reading" ? "Exporting…" : "⬇ Download everything (.zip)"}
          </Button>
        </Card>

        {state.step === "done" && (
          <Card title="Saved">
            <p role="status" className={styles.done}>
              ✅ {state.fileName} · {count(total)} rows in {EXPORT_TABLES.length} tables
            </p>
            <ul className={styles.tables} aria-label="Rows per table">
              {EXPORT_TABLES.map((t) => (
                <li key={t.name}>
                  <span>{LABELS[t.name]}</span>
                  <span className={styles.file}>{t.name}.csv</span>
                  <b>{count(state.manifest.tables[t.name] ?? 0)}</b>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
