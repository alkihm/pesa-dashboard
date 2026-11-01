import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "./Icon";
import styles from "./KpiCard.module.css";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: IconName;
  /** `hero` for the lead figure (dark card), `plain` for the rest. */
  tone?: "hero" | "plain";
  /** Makes the whole card a link. */
  to?: string;
}

export function KpiCard({ label, value, sub, icon, tone = "plain", to }: KpiCardProps) {
  const className = `${styles.kpi} ${tone === "hero" ? styles.hero : ""}`;
  const body = (
    <>
      <span className={styles.top}>
        <span className={styles.icon}>
          <Icon name={icon} size={20} />
        </span>
        <span className={styles.label}>{label}</span>
      </span>
      <span className={styles.value}>{value}</span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </>
  );

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
