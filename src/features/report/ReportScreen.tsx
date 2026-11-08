import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";

import { Logo } from "@/app/shell/Logo";
import { PageHeader } from "@/app/shell/PageHeader";
import { BarChart } from "@/components/charts/BarChart";
import {
  addMonths,
  currentMonth,
  monthParam,
  monthShort,
  monthTitle,
  parseMonth,
} from "@/features/month/month";
import { formatDay, nairobiToday } from "@/lib/due";
import { formatAmount, formatCompact } from "@/lib/money";
import { supabase, type Db } from "@/lib/supabase";
import { useReport } from "./data";
import type { Report } from "./report";
import styles from "./Report.module.css";
import { budgetMonthSpan } from "@/lib/budgetMonth";

// [4.8] Month report: a one-page overview of any month (?m=2026-10) that prints on A4. "Download PDF" opens the
// browser's print dialog, where "Save as PDF" makes the file; the toolbar is left out of the print. It sits outside
// the app shell (routes.tsx) so the phone tab bar never prints.
export function ReportScreen({ db = supabase, now = new Date() }: { db?: () => Db; now?: Date }) {
  const [params] = useSearchParams();
  const thisMonth = currentMonth(now);
  const month = parseMonth(params.get("m")) ?? thisMonth;
  const { report, error } = useReport(month, db);
  const next = addMonths(month, 1);

  // The browser suggests the page title as the PDF's file name.
  useEffect(() => {
    document.title = `Pesa report ${monthTitle(month)}`;
  }, [month]);

  const print = () => window.print();

  return (
    <div className={styles.screen}>
      <div className={styles.noPrint}>
        <PageHeader
          title="Month report"
          subtitle={[monthTitle(month), budgetMonthSpan(month)].filter(Boolean).join(" · ")}
          back={`/month?m=${monthParam(month)}`}
          trailing={
            <button type="button" className={styles.iconButton} onClick={print} aria-label="Download PDF">
              <span aria-hidden="true">⬇</span>
            </button>
          }
          controls={
            <nav aria-label="Choose month" className={styles.stepper}>
              <Link to={`/report?m=${monthParam(addMonths(month, -1))}`} className={styles.step}>
                ‹ {monthShort(addMonths(month, -1))}
              </Link>
              {next <= thisMonth && (
                <Link to={`/report?m=${monthParam(next)}`} className={styles.step}>
                  {monthShort(next)} ›
                </Link>
              )}
            </nav>
          }
          actions={
            <button type="button" className={styles.headerButton} onClick={print}>
              ⬇ Download PDF
            </button>
          }
        />
        <p className={styles.hint}>Download PDF opens the print dialog: choose “Save as PDF” and A4.</p>
      </div>

      {error && (
        <p role="alert" className={styles.status}>
          Could not make the report: {error}
        </p>
      )}
      {!report && !error && <p className={styles.status}>Loading…</p>}
      {report && <ReportSheet report={report} generated={now} />}
    </div>
  );
}

function ReportSheet({ report, generated }: { report: Report; generated: Date }) {
  const prev = monthShort(report.previous);
  return (
    <article className={styles.sheet} aria-label={`Report for ${monthTitle(report.month)}`}>
      <header className={styles.sheetHeader}>
        <Logo size={44} />
        <div className={styles.sheetTitle}>
          <span className={styles.kicker}>Monthly report</span>
          <h2>{monthTitle(report.month)}</h2>
          {budgetMonthSpan(report.month) && <p>{budgetMonthSpan(report.month)}</p>}
        </div>
        <div className={styles.generated}>
          Generated {formatDay(nairobiToday(generated))} {nairobiToday(generated).slice(0, 4)}
          {report.inProgress && (
            <>
              <br />
              Month in progress
            </>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <section aria-label="Totals" className={styles.kpis}>
          {report.kpis.map((k) => (
            <div key={k.key} className={`${styles.kpi} ${k.hero ? styles.kpiHero : ""}`}>
              <span className={styles.kpiLabel}>{k.label}</span>
              <span className={styles.kpiValue}>{formatAmount(k.cents)}</span>
              <span className={styles.kpiNote}>{k.note}</span>
            </div>
          ))}
        </section>

        <section aria-labelledby="r-hi" className={styles.highlights}>
          <h3 id="r-hi">Highlights</h3>
          <ul>
            {report.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>

        <div className={styles.pair}>
          <section aria-labelledby="r-trend">
            <h3 id="r-trend">Income vs expense · 6 months</h3>
            <BarChart
              title={`Income and spending, ${report.trend[0]!.label} to ${monthShort(report.month)}`}
              categories={report.trend.map((m) => m.label)}
              series={[
                { key: "income", label: "Income", colour: "var(--color-income)" },
                { key: "spending", label: "Expense", colour: "var(--color-expense)" },
              ]}
              values={[report.trend.map((m) => m.income), report.trend.map((m) => m.spending)]}
              formatValue={formatAmount}
              formatTick={formatCompact}
              height={150}
            />
          </section>

          <section aria-labelledby="r-pos">
            <h3 id="r-pos">{report.inProgress ? "Position today" : "Position at month end"}</h3>
            <dl className={styles.position}>
              {report.position.map((p) => (
                <div key={p.key} className={p.total ? styles.total : undefined}>
                  <dt>{p.label}</dt>
                  <dd>{formatAmount(p.cents)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section aria-labelledby="r-cat">
          <h3 id="r-cat">Where the money went</h3>
          {report.categories.length ? (
            <table className={styles.categories}>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className={styles.shareCol}>
                    Share
                  </th>
                  <th scope="col" className={styles.num}>
                    Amount
                  </th>
                  <th scope="col" className={styles.num}>
                    vs {prev}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.categories.map((c) => (
                  <tr key={c.key}>
                    <td>
                      {c.emoji} {c.label}
                    </td>
                    <td className={styles.shareCol}>
                      <span className={styles.track}>
                        <span style={{ width: `${c.share}%`, background: c.colour }} />
                      </span>
                    </td>
                    <td className={styles.num}>{formatAmount(c.cents)}</td>
                    <td className={`${styles.num} ${styles[c.tone]}`}>{c.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.sheetEmpty}>No spending recorded in {monthTitle(report.month)}.</p>
          )}
        </section>

        <section aria-labelledby="r-bills" className={styles.bills}>
          <h3 id="r-bills">Bills</h3>
          <div className={styles.billPaid}>
            ✅ Paid<b>{formatAmount(report.bills.paid)}</b>
          </div>
          <div className={styles.billDue}>
            ⏳ Still to pay<b>{formatAmount(report.bills.due)}</b>
          </div>
          <div className={styles.billSkipped}>
            ⏭️ Skipped<b>{formatAmount(report.bills.skipped)}</b>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Source: SMS via the iPhone Shortcut and entries in the app · amounts in KES</span>
          <span>Page 1 of 1</span>
        </footer>
      </div>
    </article>
  );
}
