import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` accent fill, `secondary` dark fill, `ghost` outline. */
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "sm";
  block?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], block && styles.block, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
