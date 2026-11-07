// [4.7] The import template: an Excel workbook with the owner's own account and category names in drop-down lists,
// and the same columns as a plain CSV for anyone without Excel. The Transactions sheet is empty apart from its
// header, so a template uploaded as it is imports nothing; the example lives on the "How to" sheet.

import { toCsv } from "@/features/export/csv";
import { TEMPLATE_COLUMNS, type ImportAccount, type ImportCategory } from "./rows";
import { columnName, writeXlsx, type Sheet } from "./xlsx";

const ROWS = 1000;

export function templateXlsx(
  accounts: readonly ImportAccount[],
  categories: readonly ImportCategory[],
  at = new Date(),
): Uint8Array {
  const spending = categories.filter((c) => c.kind === "spending").map((c) => c.name);
  const income = categories.filter((c) => c.kind === "income").map((c) => c.name);
  const lists: string[][] = [["Accounts", "Kinds", "Categories"]];
  const kinds = ["spending", "income", "transfer"];
  const cats = [...spending, ...income];
  const height = Math.max(accounts.length, kinds.length, cats.length);
  for (let i = 0; i < height; i++) lists.push([accounts[i]?.name ?? "", kinds[i] ?? "", cats[i] ?? ""]);

  const col = (name: (typeof TEMPLATE_COLUMNS)[number]) => columnName(TEMPLATE_COLUMNS.indexOf(name));
  const range = (c: string, n: number) => `Lists!$${c}$2:$${c}$${Math.max(2, n + 1)}`;

  const sheets: Sheet[] = [
    {
      name: "Transactions",
      header: true,
      rows: [[...TEMPLATE_COLUMNS]],
      widths: [12, 8, 18, 11, 14, 20, 24, 24, 14, 18],
      lists: [
        { cells: `${col("Account")}2:${col("Account")}${ROWS}`, from: range("A", accounts.length) },
        { cells: `${col("Kind")}2:${col("Kind")}${ROWS}`, from: range("B", kinds.length) },
        { cells: `${col("Category")}2:${col("Category")}${ROWS}`, from: range("C", cats.length) },
        { cells: `${col("To account")}2:${col("To account")}${ROWS}`, from: range("A", accounts.length) },
      ],
    },
    {
      name: "How to",
      widths: [16, 90],
      rows: [
        ["Pesa Dashboard · import template", ""],
        ["", ""],
        ["Date", "Required. 2026-11-05 or 5/11/2026 (day first)."],
        ["Time", "Optional. 14:05. Empty means midday."],
        ["Account", "Required. One of your accounts (drop-down)."],
        [
          "Kind",
          "spending, income or transfer. Empty: a negative amount is spending, a positive one income.",
        ],
        ["Amount (KES)", "Required. 1500 or 1,500.50. For spending and transfers, the sign does not matter."],
        ["Category", "Optional. Rows without one wait in Review, like an SMS no rule matched."],
        ["Payee, Note", "Optional."],
        ["Ref", "Optional. The M-PESA or bank code. A row whose code is already in the ledger is skipped."],
        ["To account", "Transfers only: where the money went."],
        ["", ""],
        [
          "Duplicates",
          "Rows already in the ledger are skipped and counted. Uploading the same file twice adds nothing.",
        ],
        ["", ""],
        [
          "Example",
          "2026-11-05 | 14:05 | M-PESA | spending | 450 | Eating out | DEMO CAFE | lunch | TKA0000001 |",
        ],
      ],
    },
    { name: "Lists", header: true, rows: lists, widths: [22, 12, 24] },
  ];
  return writeXlsx(sheets, at);
}

export const templateCsv = () => toCsv([...TEMPLATE_COLUMNS], []);
