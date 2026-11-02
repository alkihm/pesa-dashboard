// Transactions as the phone list (cards) and the desktop table. Exported for other screens too: Month ([2.4]) shows
// the same table. Both open a row for editing ([2.6]) only when given the editing props; without them they are
// read-only lists.

import type { ReactNode } from "react";
import { EmojiTile } from "@/components/EmojiTile";
import type { Category } from "@/lib/data/categories";
import { formatAmount } from "@/lib/money";
import { CategoryMenu } from "./CategoryMenu";
import { canCategorise, dayLabel, rowLook, shortDate } from "./format";
import type { ActivityRow } from "./query";
import styles from "./TransactionList.module.css";

interface ListProps {
  rows: ActivityRow[];
  label?: string;
  /** The row that is open, if any. */
  openId?: string;
  /** Opens or closes a row: the card itself on phones, the SMS button in the table. */
  onToggle?: (id: string) => void;
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

interface RowProps {
  row: ActivityRow;
  open?: boolean;
  onToggle?: () => void;
  /** Shown under the row while it is open. */
  children?: ReactNode;
}

export function TransactionRow({ row, open = false, onToggle, children }: RowProps) {
  const look = rowLook(row);
  const content = (
    <>
      <EmojiTile emoji={look.emoji} colour={look.colour} />
      <span className={styles.text}>
        <span className={styles.payee}>{payeeOf(row)}</span>
        <span className={styles.sub}>
          {look.label} · {dayLabel(row.occurred_at)}
        </span>
      </span>
      <Amount cents={row.amount_cents} />
    </>
  );
  const classes = [styles.row, look.review && styles.review, open && styles.open].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {onToggle ? (
        <button
          type="button"
          aria-expanded={open}
          className={`${styles.main} ${styles.toggle}`}
          onClick={onToggle}
        >
          {content}
        </button>
      ) : (
        <div className={styles.main}>{content}</div>
      )}
      {row.note && <p className={styles.note}>📝 {row.note}</p>}
      {open && children}
    </div>
  );
}

export function TransactionList({
  rows,
  label = "Transactions",
  openId,
  onToggle,
  renderOpen,
}: ListProps & { renderOpen?: (row: ActivityRow) => ReactNode }) {
  return (
    <ul aria-label={label} className={styles.list}>
      {rows.map((row) => (
        <li key={row.id}>
          <TransactionRow row={row} open={row.id === openId} onToggle={onToggle && (() => onToggle(row.id))}>
            {renderOpen?.(row)}
          </TransactionRow>
        </li>
      ))}
    </ul>
  );
}

interface TableProps extends ListProps {
  /** With `onCategory`, the category column becomes a drop-down that changes the row's category. */
  categories?: Category[];
  onCategory?: (row: ActivityRow, categoryId: string) => void;
}

export function TransactionTable({
  rows,
  label = "Transactions",
  openId,
  onToggle,
  categories,
  onCategory,
}: TableProps) {
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
            {onToggle && (
              <th scope="col" className={styles.right}>
                SMS
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const look = rowLook(row);
            const open = row.id === openId;
            return (
              <tr key={row.id} className={look.review ? styles.reviewRow : open ? styles.openRow : undefined}>
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
                  {categories && onCategory && canCategorise(row) ? (
                    <CategoryMenu
                      label={look.label}
                      emoji={look.emoji}
                      review={look.review}
                      value={row.category?.id ?? null}
                      categories={categories.filter((c) => c.kind === row.kind)}
                      onPick={(id) => onCategory(row, id)}
                    />
                  ) : (
                    <span
                      className={
                        look.review ? `${styles.category} ${styles.categoryReview}` : styles.category
                      }
                    >
                      <span aria-hidden="true">{look.emoji}</span> {look.label}
                    </span>
                  )}
                </td>
                <td className={styles.right}>
                  <Amount cents={row.amount_cents} />
                </td>
                {onToggle && (
                  <td className={styles.right}>
                    <button
                      type="button"
                      aria-label={`Details for ${payeeOf(row)}`}
                      aria-pressed={open}
                      className={styles.smsButton}
                      onClick={() => onToggle(row.id)}
                    >
                      📩
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
