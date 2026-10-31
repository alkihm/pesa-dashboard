import styles from "./Segmented.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  /** Names the group for screen readers, e.g. "Period". */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `header` sits on the dark page header, `surface` on a card or the page. */
  variant?: "header" | "surface";
}

/** One-of-several switch: periods, filters, transaction direction. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "header",
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`${styles.group} ${styles[variant]}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
