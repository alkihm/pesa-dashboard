import { useId, type HTMLAttributes, type ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Heading shown at the top; also labels the section. */
  title?: ReactNode;
  /** Shown at the right of the heading, e.g. a ViewAllLink. */
  action?: ReactNode;
  /** `hero` is the dark summary card at the top of a screen. */
  variant?: "default" | "hero";
}

export function Card({ title, action, variant = "default", className, children, ...rest }: CardProps) {
  const headingId = useId();
  const classes = [styles.card, variant === "hero" && styles.hero, className].filter(Boolean).join(" ");

  return (
    <section className={classes} aria-labelledby={title ? headingId : undefined} {...rest}>
      {title && (
        <div className={styles.head}>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
