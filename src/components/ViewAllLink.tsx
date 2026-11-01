import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./ViewAllLink.module.css";

/** The small link at the right of a card heading. */
export function ViewAllLink({ to, children = "View all" }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className={styles.link}>
      {children}
    </Link>
  );
}
