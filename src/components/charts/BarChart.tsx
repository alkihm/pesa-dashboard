import { useState } from "react";
import { niceMax } from "./chartMath";
import styles from "./BarChart.module.css";

export interface BarSeries {
  key: string;
  label: string;
  /** A token, e.g. "var(--color-income)". */
  colour: string;
}

interface BarChartProps {
  /** Describes the chart for screen readers and as the table caption. */
  title: string;
  /** X-axis labels, e.g. month names. */
  categories: string[];
  series: BarSeries[];
  /** values[series][category], non-negative. */
  values: number[][];
  formatValue: (value: number) => string;
  /** Axis labels; defaults to formatValue. */
  formatTick?: (value: number) => string;
  height?: number;
}

/** Grouped bars on one axis: one group per category, one bar per series. */
export function BarChart({
  title,
  categories,
  series,
  values,
  formatValue,
  formatTick = formatValue,
  height = 220,
}: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...values.flat()));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);

  return (
    <figure className={styles.figure}>
      {series.length > 1 && (
        <div className={styles.legend} aria-hidden="true">
          {series.map((s) => (
            <span key={s.key} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: s.colour }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className={styles.frame} aria-hidden="true">
        <div className={styles.axis} style={{ height }}>
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              {formatTick(t)}
            </span>
          ))}
        </div>

        <div className={styles.plotArea}>
          <div className={styles.plot} style={{ height }} onMouseLeave={() => setActive(null)}>
            {ticks.map((t) => (
              <span key={t} className={styles.grid} style={{ bottom: `${(t / top) * 100}%` }} />
            ))}
            {categories.map((category, i) => (
              <div
                key={category}
                className={`${styles.group} ${active === i ? styles.groupActive : ""}`}
                onMouseEnter={() => setActive(i)}
              >
                {series.map((s, si) => (
                  <span
                    key={s.key}
                    className={styles.bar}
                    style={{ height: `${((values[si]?.[i] ?? 0) / top) * 100}%`, background: s.colour }}
                  />
                ))}
              </div>
            ))}
            {active !== null && (
              <div
                className={`${styles.tooltip} ${active >= categories.length / 2 ? styles.tooltipLeft : ""}`}
                style={{ left: `${((active + 0.5) / categories.length) * 100}%` }}
              >
                <strong>{categories[active]}</strong>
                {series.map((s, si) => (
                  <span key={s.key} className={styles.tooltipRow}>
                    <span className={styles.swatch} style={{ background: s.colour }} />
                    {s.label}
                    <b>{formatValue(values[si]?.[active] ?? 0)}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={styles.labels}>
            {categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        </div>
      </div>

      <table className="visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category, i) => (
            <tr key={category}>
              <th scope="row">{category}</th>
              {series.map((s, si) => (
                <td key={s.key}>{formatValue(values[si]?.[i] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
