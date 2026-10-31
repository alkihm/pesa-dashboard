import { useState, type ReactNode } from "react";
import { categoryColourVar } from "@/lib/categoryColours";
import { foldSlices } from "./chartMath";
import styles from "./Donut.module.css";

export interface DonutSlice {
  key: string;
  label: string;
  /** Non-negative amount, e.g. cents. */
  value: number;
  /** Category colour key (cat-1 … cat-12). */
  colour: string;
  emoji?: string;
}

interface DonutProps {
  /** Describes the chart for screen readers, e.g. "October spending by category". */
  title: string;
  slices: DonutSlice[];
  centerValue: ReactNode;
  centerLabel: string;
  formatValue: (value: number) => string;
  /** Slices beyond this fold into "Other" (default 6). */
  maxSlices?: number;
}

const SIZE = 220;
const RADIUS = 84;
const STROKE = 28;
const GAP = 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Share of the whole donut, as a percentage. */
function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export function Donut({ title, slices, centerValue, centerLabel, formatValue, maxSlices = 6 }: DonutProps) {
  const [active, setActive] = useState<string | null>(null);
  const shown = foldSlices(slices, maxSlices);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  const activeSlice = shown.find((s) => s.key === active);

  const lengths = shown.map((slice) => (slice.value / total) * CIRCUMFERENCE);
  const arcs = shown.map((slice, i) => ({
    slice,
    dash: Math.max(lengths[i]! - GAP, 0.5),
    offset: lengths.slice(0, i).reduce((sum, length) => sum + length, 0),
  }));

  return (
    <div className={styles.donut}>
      <div className={styles.chart}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={styles.svg}
          role="img"
          aria-label={`${title}: ${shown.map((s) => `${s.label} ${percent(s.value, total)}%`).join(", ")}`}
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map(({ slice, dash, offset: start }) => (
              <circle
                key={slice.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                strokeDashoffset={-start}
                style={{ stroke: categoryColourVar(slice.colour) }}
                className={active && active !== slice.key ? styles.dim : undefined}
                onMouseEnter={() => setActive(slice.key)}
                onMouseLeave={() => setActive(null)}
              />
            ))}
          </g>
        </svg>
        <div className={styles.center} aria-hidden="true">
          {activeSlice ? (
            <>
              <span className={styles.centerValue}>{formatValue(activeSlice.value)}</span>
              <span className={styles.centerLabel}>
                {activeSlice.label} · {percent(activeSlice.value, total)}%
              </span>
            </>
          ) : (
            <>
              <span className={styles.centerValue}>{centerValue}</span>
              <span className={styles.centerLabel}>{centerLabel}</span>
            </>
          )}
        </div>
      </div>

      <table className={styles.legend}>
        <caption className="visually-hidden">{title}</caption>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((slice) => (
            <tr
              key={slice.key}
              tabIndex={0}
              className={active === slice.key ? styles.activeRow : undefined}
              onMouseEnter={() => setActive(slice.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(slice.key)}
              onBlur={() => setActive(null)}
            >
              <th scope="row" className={styles.name}>
                <span
                  className={styles.dot}
                  style={{ background: categoryColourVar(slice.colour) }}
                  aria-hidden="true"
                />
                {slice.emoji && <span aria-hidden="true">{slice.emoji} </span>}
                {slice.label}
              </th>
              <td className={styles.amount}>{formatValue(slice.value)}</td>
              <td className={styles.share}>{percent(slice.value, total)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
