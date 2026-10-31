import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { BarChart } from "@/components/charts/BarChart";
import { Donut, type DonutSlice } from "@/components/charts/Donut";
import { Chip } from "@/components/Chip";
import { EmojiTile } from "@/components/EmojiTile";
import { NumberField, SelectField, TextField } from "@/components/Field";
import { KpiCard } from "@/components/KpiCard";
import { Segmented } from "@/components/Segmented";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { Switch } from "@/components/Switch";
import { ViewAllLink } from "@/components/ViewAllLink";
import { CATEGORY_COLOURS } from "@/lib/categoryColours";
import { formatAmount, formatCompact } from "@/lib/money";
import { PageHeader } from "../shell/PageHeader";
import styles from "./ComponentGallery.module.css";

// Development-only page (/dev/components) showing every shared component. All figures are invented.

const SPENDING: DonutSlice[] = [
  { key: "rent", label: "Rent", value: 4_500_000, colour: "cat-1", emoji: "🏠" },
  { key: "food", label: "Food", value: 2_840_000, colour: "cat-2", emoji: "🛒" },
  { key: "transport", label: "Transport", value: 2_170_000, colour: "cat-3", emoji: "⛽" },
  { key: "family", label: "Family", value: 1_500_000, colour: "cat-4", emoji: "👪" },
  { key: "shopping", label: "Shopping", value: 1_260_000, colour: "cat-5", emoji: "🛍️" },
  { key: "utilities", label: "Utilities", value: 985_000, colour: "cat-6", emoji: "💡" },
  { key: "eating", label: "Eating out", value: 890_000, colour: "cat-7", emoji: "🍽️" },
];

const MONTHS = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const INCOME = [17_500_000, 18_200_000, 17_800_000, 19_100_000, 18_600_000, 21_000_000];
const EXPENSE = [16_400_000, 17_100_000, 18_900_000, 20_100_000, 17_300_000, 17_190_000];

const TONES: [Tone, string][] = [
  ["red", "Overdue · 2 days"],
  ["orange", "Due in 2 days"],
  ["amber", "Due in 5 days"],
  ["blue", "Due 12 Nov"],
  ["green", "✓ Paid"],
  ["grey", "Skipped"],
];

export function ComponentGallery() {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [filter, setFilter] = useState<"all" | "due" | "paid">("all");
  const [chip, setChip] = useState("Food");
  const [alerts, setAlerts] = useState(true);

  return (
    <>
      <PageHeader
        title="Components"
        subtitle="Shared building blocks · invented figures"
        back="/"
        controls={
          <Segmented
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "month", label: "Month" },
              { value: "quarter", label: "Quarter" },
              { value: "year", label: "Year" },
            ]}
          />
        }
      />
      <div className={styles.page}>
        <div className={styles.kpis}>
          <KpiCard
            tone="hero"
            icon="wallet"
            label="Net position"
            value="KES 248,600"
            sub="+12,400 this month"
          />
          <KpiCard
            icon="chart"
            label="Spent this month"
            value="171,900"
            sub="of 190,000 budget"
            to="/month"
          />
          <KpiCard icon="bill" label="Bills to pay" value="53,700" sub="4 bills · next in 2 days" />
        </div>

        <div className={styles.row}>
          <Card title="Where the money went" action={<ViewAllLink to="/month">All</ViewAllLink>}>
            <Donut
              title="October spending by category"
              slices={SPENDING}
              centerValue={formatCompact(SPENDING.reduce((s, x) => s + x.value, 0))}
              centerLabel="spent"
              formatValue={(v) => formatAmount(v)}
            />
          </Card>
          <Card title="Income vs expense">
            <BarChart
              title="Income and expense by month"
              categories={MONTHS}
              series={[
                { key: "income", label: "Income", colour: "var(--color-income)" },
                { key: "expense", label: "Expense", colour: "var(--color-expense)" },
              ]}
              values={[INCOME, EXPENSE]}
              formatValue={(v) => formatAmount(v)}
              formatTick={formatCompact}
            />
          </Card>
        </div>

        <div className={styles.row}>
          <Card variant="hero">
            <div className={styles.heroFigures}>
              <div>
                <div className={styles.heroLabel}>✅ Paid</div>
                <div className={styles.heroValue}>53,800</div>
              </div>
              <div>
                <div className={styles.heroLabel}>⏳ To pay</div>
                <div className={styles.heroValue}>53,700</div>
              </div>
            </div>
          </Card>
          <Card title="Status pills">
            <div className={styles.wrap}>
              {TONES.map(([tone, text]) => (
                <StatusPill key={tone} tone={tone}>
                  {text}
                </StatusPill>
              ))}
            </div>
          </Card>
        </div>

        <div className={styles.row}>
          <Card title="Chips and segmented control">
            <div className={styles.stack}>
              <div className={styles.wrap}>
                {["Rent", "Food", "Transport", "Family", "Shopping"].map((name) => (
                  <Chip key={name} selected={chip === name} onClick={() => setChip(name)}>
                    {name}
                  </Chip>
                ))}
              </div>
              <Segmented
                label="Show bills"
                variant="surface"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "due", label: "To pay" },
                  { value: "paid", label: "Paid" },
                ]}
              />
              <div className={styles.switchRow}>
                <span id="alert-label">Review is due</span>
                <Switch checked={alerts} onChange={setAlerts} labelledBy="alert-label" />
              </div>
            </div>
          </Card>
          <Card title="Emoji tiles and category colours">
            <div className={styles.wrap}>
              {CATEGORY_COLOURS.map((c) => (
                <span key={c.key} className={styles.swatchItem}>
                  <EmojiTile emoji="🏷️" colour={c.key} />
                  {c.name}
                </span>
              ))}
            </div>
          </Card>
        </div>

        <Card title="Fields and buttons">
          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
            <TextField label="Paid to" placeholder="e.g. NAIVAS" />
            <NumberField label="Amount" placeholder="KES 0" hint="Shillings, cents optional" />
            <SelectField label="From account" defaultValue="mpesa">
              <option value="mpesa">📱 M-PESA</option>
              <option value="bank">🏦 Bank</option>
              <option value="cash">💵 Cash</option>
            </SelectField>
            <TextField label="Reference" defaultValue="ABC123" error="This reference is already recorded" />
            <div className={styles.buttons}>
              <Button type="submit">Save transaction</Button>
              <Button variant="secondary">Read SMS</Button>
              <Button variant="ghost" size="sm">
                Skip
              </Button>
              <Button size="sm">Pay</Button>
              <Button disabled>Disabled</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
