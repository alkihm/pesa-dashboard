import { useState, type DragEvent } from "react";
import { Link } from "react-router";

import { PageHeader } from "@/app/shell/PageHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { useAccounts } from "@/lib/data/accounts";
import { useCategories } from "@/lib/data/categories";
import { formatDay } from "@/lib/due";
import { announce } from "@/lib/live";
import { formatAmount } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { classify, loadLedger, type Checked } from "./dedupe";
import { parseSheet, type RowError } from "./rows";
import { saveImport, type ImportResult } from "./save";
import { templateCsv, templateXlsx } from "./template";
import { readTable } from "./read";
import styles from "./Import.module.css";

/** Hands a file to the browser as a download. */
function save(data: Uint8Array | string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type Download = (data: Uint8Array | string, fileName: string, type: string) => void;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type State =
  | { step: "pick"; error?: string }
  | { step: "reading"; fileName: string }
  | { step: "preview"; fileName: string; checked: Checked[]; errors: RowError[]; anyway: ReadonlySet<number> }
  | { step: "saving"; fileName: string }
  | { step: "done"; fileName: string; result: ImportResult; duplicates: number; errors: number };

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// [4.7] Bulk import: download the template (with your own account and category names), fill in what the SMS feed
// missed, upload it as .xlsx or .csv, check the preview — duplicates skipped and counted, errors shown per row — and
// import. Settings and the Month screen link here.
export function ImportScreen({ db = supabase, download = save }: { db?: () => Db; download?: Download }) {
  const { accounts } = useAccounts(db);
  const { categories } = useCategories(db);
  const [state, setState] = useState<State>({ step: "pick" });
  const [dragging, setDragging] = useState(false);
  const ready = !!accounts && !!categories;

  const lists = () => ({
    accounts: (accounts ?? []).map((a) => ({
      id: a.account_id,
      name: a.name ?? "",
      sms_account_hint: a.sms_account_hint,
    })),
    categories: (categories ?? []).map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
  });

  async function pick(file: File | undefined) {
    if (!file || !ready) return;
    setState({ step: "reading", fileName: file.name });
    try {
      const sheet = parseSheet(await readTable(file), lists());
      const checked = classify(sheet.rows, await loadLedger(db(), sheet.rows));
      if (!sheet.read) throw new Error("The file has no rows under the column names");
      setState({ step: "preview", fileName: file.name, checked, errors: sheet.errors, anyway: new Set() });
    } catch (e) {
      setState({ step: "pick", error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function run(s: Extract<State, { step: "preview" }>) {
    const keep = s.checked.filter((c) => c.verdict.status === "new" || s.anyway.has(c.row.line));
    setState({ step: "saving", fileName: s.fileName });
    try {
      const result = await saveImport(db(), s.fileName, keep);
      announce(["transactions"]);
      setState({
        step: "done",
        fileName: s.fileName,
        result,
        duplicates: s.checked.length - keep.length,
        errors: s.errors.length,
      });
    } catch (e) {
      setState({ ...s, step: "pick", error: e instanceof Error ? e.message : String(e) });
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files[0]);
  }

  return (
    <>
      <PageHeader
        title="Bulk import"
        phoneTitle="Import"
        subtitle="Fill gaps when the SMS feed was down"
        back="/settings"
      />
      <div className={styles.page}>
        {/* Settings' "Excel template" row links to /import#template. */}
        <Card title="⬇️ Template" id="template">
          <p className={styles.text}>
            Your accounts and categories are in the Excel drop-downs. Fill one row per transaction; the ref
            (M-PESA or bank code) lets duplicates be spotted for sure.
          </p>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={!ready}
              onClick={() => {
                const l = lists();
                download(templateXlsx(l.accounts, l.categories), "pesa-import-template.xlsx", XLSX_TYPE);
              }}
            >
              ⬇️ Excel template (.xlsx)
            </Button>
            <Button
              variant="ghost"
              onClick={() => download(templateCsv(), "pesa-import-template.csv", "text/csv")}
            >
              CSV template
            </Button>
          </div>
        </Card>

        {(state.step === "pick" || state.step === "reading") && (
          <Card title="⬆️ Upload">
            <label
              className={`${styles.drop} ${dragging ? styles.dragging : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <span aria-hidden="true" className={styles.dropIcon}>
                📂
              </span>
              <span className={styles.dropTitle}>
                {state.step === "reading"
                  ? `Reading ${state.fileName}…`
                  : "Choose or drop a .xlsx or .csv file"}
              </span>
              <span className={styles.muted}>Duplicates are skipped</span>
              <input
                type="file"
                accept=".xlsx,.csv,text/csv"
                className={styles.file}
                aria-label="File to import"
                disabled={!ready || state.step === "reading"}
                onChange={(e) => {
                  void pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {state.step === "pick" && state.error && (
              <p role="alert" className={styles.error}>
                {state.error}
              </p>
            )}
          </Card>
        )}

        {state.step === "preview" && (
          <Preview state={state} onChange={setState} onImport={() => void run(state)} />
        )}

        {state.step === "saving" && (
          <Card>
            <p role="status" className={styles.text}>
              Importing {state.fileName}…
            </p>
          </Card>
        )}

        {state.step === "done" && (
          <Card title="Import finished">
            <p role="status" className={state.result.error ? styles.error : styles.done}>
              {state.result.error ? "⚠️" : "✅"} Imported {plural(state.result.saved, "transaction")} from{" "}
              {state.fileName}
            </p>
            <ul className={styles.summary}>
              <li>{plural(state.duplicates, "duplicate")} skipped</li>
              <li>{plural(state.errors, "row")} with errors left out</li>
              {state.result.error && (
                <li className={styles.error}>
                  Stopped part-way: {state.result.error}. Upload the same file again to add the rest; rows
                  already imported are skipped.
                </li>
              )}
            </ul>
            <div className={styles.actions}>
              <Link to="/activity" className={styles.link}>
                See them in Activity ›
              </Link>
              <Button variant="ghost" onClick={() => setState({ step: "pick" })}>
                Import another file
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function Preview({
  state,
  onChange,
  onImport,
}: {
  state: Extract<State, { step: "preview" }>;
  onChange: (s: State) => void;
  onImport: () => void;
}) {
  const { checked, errors, anyway } = state;
  const fresh = checked.filter((c) => c.verdict.status === "new" || anyway.has(c.row.line)).length;
  const duplicates = checked.length - fresh;
  const lines = [
    ...checked.map((c) => ({ line: c.row.line, c })),
    ...errors.map((e) => ({ line: e.line, e })),
  ].sort((a, b) => a.line - b.line);

  return (
    <Card title={`Preview · ${state.fileName}`}>
      <ul className={styles.counts} aria-label="Summary">
        <li>
          <StatusPill tone="green">✓ {plural(fresh, "to import", "to import")}</StatusPill>
        </li>
        <li>
          <StatusPill tone="grey">⧉ {plural(duplicates, "duplicate")}</StatusPill>
        </li>
        <li>
          <StatusPill tone={errors.length ? "red" : "grey"}>⚠ {plural(errors.length, "error")}</StatusPill>
        </li>
      </ul>

      <ol className={styles.rows} aria-label="Rows">
        {lines.map((x) =>
          "c" in x && x.c ? (
            <li key={x.line} className={styles.row}>
              <span className={styles.line}>Row {x.line}</span>
              <span className={styles.main}>
                <span className={styles.what}>
                  {formatDay(x.c.row.day)} · {x.c.row.accountName}
                  {x.c.row.toAccountName ? ` → ${x.c.row.toAccountName}` : ""} ·{" "}
                  {x.c.row.payee ?? x.c.row.categoryName ?? x.c.row.kind}
                </span>
                {x.c.verdict.status !== "new" && <span className={styles.muted}>{x.c.verdict.reason}</span>}
                {x.c.verdict.status === "likely" && (
                  <label className={styles.anyway}>
                    <input
                      type="checkbox"
                      checked={anyway.has(x.line)}
                      onChange={(e) => {
                        const next = new Set(anyway);
                        if (e.target.checked) next.add(x.line);
                        else next.delete(x.line);
                        onChange({ ...state, anyway: next });
                      }}
                    />
                    Import anyway
                  </label>
                )}
              </span>
              <span className={`${styles.amount} ${x.c.row.kind === "income" ? styles.in : ""}`}>
                {formatAmount(x.c.row.kind === "income" ? x.c.row.cents : -x.c.row.cents, {
                  signed: x.c.row.kind === "income",
                })}
              </span>
              <StatusPill tone={x.c.verdict.status === "new" || anyway.has(x.line) ? "green" : "grey"}>
                {x.c.verdict.status === "new" || anyway.has(x.line) ? "New" : "Duplicate"}
              </StatusPill>
            </li>
          ) : "e" in x && x.e ? (
            <li key={x.line} className={`${styles.row} ${styles.bad}`}>
              <span className={styles.line}>Row {x.line}</span>
              <span className={styles.main}>
                <span className={styles.what}>{x.e.text || "—"}</span>
                {x.e.errors.map((m) => (
                  <span key={m} className={styles.error}>
                    {m}
                  </span>
                ))}
              </span>
              <StatusPill tone="red">Error</StatusPill>
            </li>
          ) : null,
        )}
      </ol>

      <div className={styles.actions}>
        <Button onClick={onImport} disabled={!fresh}>
          {fresh ? `Import ${plural(fresh, "transaction")}` : "Nothing new to import"}
        </Button>
        <Button variant="ghost" onClick={() => onChange({ step: "pick" })}>
          Choose another file
        </Button>
      </div>
      {errors.length > 0 && (
        <p className={styles.muted}>
          Rows with errors are left out. Fix them in the file and upload it again — rows already imported are
          skipped.
        </p>
      )}
    </Card>
  );
}
