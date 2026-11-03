import { useState } from "react";
import type { BarSeries } from "./BarChart";
import { niceMax } from "./chartMath";
import bar from "./BarChart.module.css";
import styles from "./LineChart.module.css";

interface LineChartProps {
  /** Describes the chart for screen readers and as the table caption. */
  title: string;
  /** X-axis labels, e.g. month names. */
  categories: string[];
  /** The first series also gets a soft fill under its line. */
  series: BarSeries[];
  /** values[series][category], non-negative. */
  values: number[][];
  formatValue: (value: number) => string;
  /** Axis labels; defaults to formatValue. */
  formatTick?: (value: number) => string;
  height?: number;
  /** Phones: no axis and no dots, just the lines. */
  compact?: boolean;
}

/** Lines on one axis, one point per category. Shares the axis, grid, labels and tooltip look of BarChart. */
export function LineChart({
  title,
  categories,
  series,
  values,
  formatValue,
  formatTick = formatValue,
  height = 220,
  compact = false,
}: LineChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...values.flat()));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const n = categories.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / top) * 100;
  const points = (s: number) => categories.map((_, i) => `${x(i)},${y(values[s]?.[i] ?? 0)}`).join(" ");

  return (
    <figure className={bar.figure}>
      {series.length > 1 && !compact && (
        <div className={bar.legend} aria-hidden="true">
          {series.map((s) => (
            <span key={s.key} className={bar.legendItem}>
              <span className={bar.swatch} style={{ background: s.colour }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className={bar.frame} aria-hidden="true">
        {!compact && (
          <div className={bar.axis} style={{ height }}>
            {ticks.map((t) => (
              <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
                {formatTick(t)}
              </span>
            ))}
          </div>
        )}

        <div className={bar.plotArea}>
          <div className={bar.plot} style={{ height }} onMouseLeave={() => setActive(null)}>
            {!compact &&
              ticks.map((t) => (
                <span key={t} className={bar.grid} style={{ bottom: `${(t / top) * 100}%` }} />
              ))}
            <svg className={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="none">
              {series[0] && n > 0 && (
                <polygon
                  className={styles.area}
                  points={`${x(0)},100 ${points(0)} ${x(n - 1)},100`}
                  style={{ fill: series[0].colour }}
                />
              )}
              {series.map((s, si) => (
                <polyline
                  key={s.key}
                  className={styles.line}
                  points={points(si)}
                  style={{ stroke: s.colour }}
                />
              ))}
            </svg>
            {!compact &&
              series.map((s, si) =>
                categories.map((category, i) => (
                  <span
                    key={`${s.key}-${category}`}
                    className={`${styles.dot} ${active === i ? styles.dotActive : ""}`}
                    style={{
                      left: `${x(i)}%`,
                      bottom: `${100 - y(values[si]?.[i] ?? 0)}%`,
                      background: s.colour,
                    }}
                  />
                )),
              )}
            {categories.map((category, i) => (
              <div
                key={category}
                className={`${styles.column} ${active === i ? bar.groupActive : ""}`}
                onMouseEnter={() => setActive(i)}
              />
            ))}
            {active !== null && (
              <div
                className={`${bar.tooltip} ${active >= n / 2 ? bar.tooltipLeft : ""}`}
                style={{ left: `${x(active)}%` }}
              >
                <strong>{categories[active]}</strong>
                {series.map((s, si) => (
                  <span key={s.key} className={bar.tooltipRow}>
                    <span className={bar.swatch} style={{ background: s.colour }} />
                    {s.label}
                    <b>{formatValue(values[si]?.[active] ?? 0)}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={`${bar.labels} ${styles.labels}`}>
            {categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        </div>
      </div>

      {/* A table ignores the 1px size of .visually-hidden, so the wrapper hides it without taking room. */}
      <div className="visually-hidden">
        <table>
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
      </div>
    </figure>
  );
}
