import type { ButtonHTMLAttributes } from "react";
import styles from "./Chip.module.css";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  selected?: boolean;
}

/** A toggle pill, e.g. a category in the add-transaction form. */
export function Chip({ selected = false, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[styles.chip, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
