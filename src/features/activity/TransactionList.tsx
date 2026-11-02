// Transactions as the phone list (cards) and the desktop table. Exported for other screens too: Month ([2.4]) shows
// the same table. Opening a row for editing comes with [2.6].

import { EmojiTile } from "@/components/EmojiTile";
import { formatAmount } from "@/lib/money";
import { dayLabel, rowLook, shortDate } from "./format";
import type { ActivityRow } from "./query";
import styles from "./TransactionList.module.css";

interface ListProps {
  rows: ActivityRow[];
  label?: string;
}

function Amount({ cents }: { cents: number }) {
  return (
    <span className={cents > 0 ? `${styles.amount} ${styles.in}` : styles.amount}>
      {formatAmount(cents, { signed: true })}
    </span>
  );
}

function payeeOf(row: ActivityRow) {
  return row.payee || row.account.name;
}

export function TransactionRow({ row }: { row: ActivityRow }) {
  const look = rowLook(row);
  return (
    <div className={look.review ? `${styles.row} ${styles.review}` : styles.row}>
      <div className={styles.main}>
        <EmojiTile emoji={look.emoji} colour={look.colour} />
        <span className={styles.text}>
          <span className={styles.payee}>{payeeOf(row)}</span>
          <span className={styles.sub}>
            {look.label} · {dayLabel(row.occurred_at)}
          </span>
        </span>
        <Amount cents={row.amount_cents} />
      </div>
      {row.note && <p className={styles.note}>📝 {row.note}</p>}
    </div>
  );
}

export function TransactionList({ rows, label = "Transactions" }: ListProps) {
  return (
    <ul aria-label={label} className={styles.list}>
      {rows.map((row) => (
        <li key={row.id}>
          <TransactionRow row={row} />
        </li>
      ))}
    </ul>
  );
}

export function TransactionTable({ rows, label = "Transactions" }: ListProps) {
  return (
    <div className={styles.tableWrap}>
      <table aria-label={label} className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Payee</th>
            <th scope="col">Category</th>
            <th scope="col" className={styles.right}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const look = rowLook(row);
            return (
              <tr key={row.id} className={look.review ? styles.reviewRow : undefined}>
                <td className={styles.date}>{shortDate(row.occurred_at)}</td>
                <td>
                  <span className={styles.payeeCell}>
                    <EmojiTile emoji={row.account.emoji ?? "🏦"} size="sm" />
                    <span className={styles.text}>
                      <span className={styles.payee}>{payeeOf(row)}</span>
                      {row.note && <span className={styles.tableNote}>📝 {row.note}</span>}
                    </span>
                  </span>
                </td>
                <td>
                  <span
                    className={look.review ? `${styles.category} ${styles.categoryReview}` : styles.category}
                  >
                    <span aria-hidden="true">{look.emoji}</span> {look.label}
                  </span>
                </td>
                <td className={styles.right}>
                  <Amount cents={row.amount_cents} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
