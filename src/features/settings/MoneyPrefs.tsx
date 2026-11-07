// [4.9] part B: the ledger currency and the day the budget month starts (D-016). Both change what every screen
// shows, so saving them makes every screen read again.

import { SelectField } from "@/components/Field";
import { budgetMonthSpan, budgetMonthOf, ordinal } from "@/lib/budgetMonth";
import { CURRENCIES } from "@/lib/money";
import type { Prefs } from "./data";
import styles from "./SettingsScreen.module.css";

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function MoneyPrefs({ prefs, onChange }: { prefs: Prefs; onChange: (prefs: Prefs) => void }) {
  const span = budgetMonthSpan(budgetMonthOf(new Date(), prefs.monthStartDay), prefs.monthStartDay);
  return (
    <>
      <div className={styles.moneyFields}>
        <SelectField
          label="Currency"
          value={prefs.currency}
          onChange={(e) => onChange({ ...prefs, currency: e.target.value })}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Budget month starts"
          value={String(prefs.monthStartDay)}
          onChange={(e) => onChange({ ...prefs, monthStartDay: Number(e.target.value) })}
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {ordinal(d)} of the month
            </option>
          ))}
        </SelectField>
      </div>
      <p className={styles.note}>
        Amounts are shown in this currency, never converted.{" "}
        {span
          ? `This month runs ${span}; month totals and budgets follow it.`
          : "Months follow the calendar."}
      </p>
    </>
  );
}
