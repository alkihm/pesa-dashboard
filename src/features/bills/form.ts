// [3.1] Add bill: the form's state, its check and the row it saves. Monthly bills only (ARCHITECTURE: bills).

import type { Database } from "@/lib/database.types";
import { nairobiToday } from "@/lib/due";
import { amountCents } from "../transactions/form";

export type BillInsert = Database["public"]["Tables"]["bills"]["Insert"];

export const BILL_ICONS: { emoji: string; name: string }[] = [
  { emoji: "🏠", name: "Rent" },
  { emoji: "💡", name: "Electricity" },
  { emoji: "💧", name: "Water" },
  { emoji: "🌐", name: "Internet" },
  { emoji: "📺", name: "TV" },
  { emoji: "🎬", name: "Streaming" },
  { emoji: "🤖", name: "Software" },
  { emoji: "📱", name: "Phone" },
  { emoji: "🚗", name: "Car" },
  { emoji: "⛽", name: "Fuel" },
  { emoji: "🎓", name: "School" },
  { emoji: "🛡️", name: "Insurance" },
  { emoji: "🏋️", name: "Gym" },
  { emoji: "🧾", name: "Other" },
];

export interface BillForm {
  name: string;
  emoji: string;
  amount: string;
  dueDay: string;
  accountId: string;
  categoryId: string;
  /** Text in the payee of the SMS that pays this bill; marks the month paid when it arrives ([3.2], D-015). */
  payeeMatch: string;
  /** When the due day has passed this month: true starts the bill next month (this month is already paid). */
  startNextMonth: boolean;
}

export function emptyBillForm(): BillForm {
  return {
    name: "",
    emoji: "🧾",
    amount: "",
    dueDay: "",
    accountId: "",
    categoryId: "",
    payeeMatch: "",
    startNextMonth: true,
  };
}

function dueDayOf(text: string): number | undefined {
  const t = text.trim();
  return /^([1-9]|[12]\d|3[01])$/.test(t) ? Number(t) : undefined;
}

/** True when this month's due day is already behind today (Nairobi), so the form asks about this month. */
export function dueDayPassed(form: Pick<BillForm, "dueDay">, now = new Date()): boolean {
  const day = dueDayOf(form.dueDay);
  return day !== undefined && day < Number(nairobiToday(now).slice(8, 10));
}

export function billProblem(form: BillForm): string | undefined {
  if (!form.name.trim()) return "Give the bill a name.";
  if (!amountCents(form.amount)) return "The amount must be above zero.";
  if (dueDayOf(form.dueDay) === undefined) return "The due day is a day of the month, 1 to 31.";
  if (form.payeeMatch.trim() && form.payeeMatch.trim().length < 3)
    return "The SMS payee needs at least 3 letters, or it would match other payments.";
  return undefined;
}

function monthStart(now: Date, offset: number): string {
  const [y, m] = nairobiToday(now).split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
}

export function buildBill(form: BillForm, now = new Date()): BillInsert {
  return {
    name: form.name.trim(),
    emoji: form.emoji,
    amount_cents: amountCents(form.amount)!,
    due_day: dueDayOf(form.dueDay)!,
    account_id: form.accountId || null,
    category_id: form.categoryId || null,
    payee_match: form.payeeMatch.trim() || null,
    starts_on: monthStart(now, dueDayPassed(form, now) && form.startNextMonth ? 1 : 0),
  };
}
