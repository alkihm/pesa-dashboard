// [4.9] The link cards: Import & export (report [4.8], bulk import [4.7] and CSV export [4.10] are Hydracore's
// screens; Settings only links to them) and Manage (accounts, categories, bills).

import { Link } from "react-router";

import { Card } from "@/components/Card";
import { EmojiTile } from "@/components/EmojiTile";
import type { SettingsData } from "./data";
import styles from "./SettingsScreen.module.css";

interface Row {
  to: string;
  emoji: string;
  title: string;
  meta?: string;
  /** Only in the phone list (the desktop board leaves it out). */
  phone?: boolean;
}

function Rows({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <ul className={styles.rows} aria-label={label}>
      {rows.map((r) => (
        <li key={r.to + r.title} className={r.phone ? styles.phoneOnly : undefined}>
          <Link to={r.to} className={styles.linkRow}>
            <EmojiTile emoji={r.emoji} size="sm" />
            <span className={styles.linkText}>
              <span className={styles.linkTitle}>{r.title}</span>
              {r.meta && <span className={styles.linkMeta}>{r.meta}</span>}
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const monthYear = new Intl.DateTimeFormat("en-KE", {
  timeZone: "Africa/Nairobi",
  month: "long",
  year: "numeric",
});
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ImportExportCard({ now = new Date() }: { now?: Date }) {
  return (
    <Card title="📤 Import & export">
      <Rows
        label="Import and export"
        rows={[
          {
            to: "/report",
            emoji: "📄",
            title: "Month report (PDF)",
            meta: `${monthYear.format(now)} overview`,
          },
          { to: "/import#template", emoji: "⬇️", title: "Excel template", meta: "For bulk transactions" },
          {
            to: "/import",
            emoji: "⬆️",
            title: "Upload transactions",
            meta: ".xlsx or .csv · duplicates skipped",
          },
          { to: "/export", emoji: "🗃️", title: "Export everything", meta: "All years as CSV" },
        ]}
      />
    </Card>
  );
}

export function ManageCard({ counts }: { counts?: SettingsData["counts"] }) {
  return (
    <Card title="🗂️ Manage">
      <Rows
        label="Manage"
        rows={[
          {
            to: "/accounts",
            emoji: "🏦",
            title: "Accounts",
            meta: counts && `${plural(counts.accounts, "account")} · ${counts.smsMatched} SMS matching`,
          },
          { to: "/accounts/savings", emoji: "🐷", title: "Savings accounts", phone: true },
          { to: "/accounts/debt", emoji: "💳", title: "Loans and cards", phone: true },
          {
            to: "/categories",
            emoji: "🏷️",
            title: "Categories",
            meta:
              counts &&
              `${plural(counts.categories, "category", "categories")} · ${plural(counts.rules, "payee rule")}`,
          },
          {
            to: "/bills",
            emoji: "🧾",
            title: "Recurring bills",
            meta: counts && `${plural(counts.bills, "bill")} · due-date colours`,
          },
          { to: "/accounts/new", emoji: "➕", title: "Add an account", phone: true },
        ]}
      />
    </Card>
  );
}
