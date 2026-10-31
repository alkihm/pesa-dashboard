import { useEffect, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { Icon } from "./icons";
import { Logo } from "./Logo";
import { DESKTOP_NAV } from "./navigation";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: string;
  /** Title in the phone header when it differs from the desktop one. */
  phoneTitle?: string;
  subtitle?: ReactNode;
  /** Phone only: a back button to this path, in place of `leading`. */
  back?: string;
  /** Phone only: buttons left and right of the title. */
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Desktop only: buttons at the right of the title row. */
  actions?: ReactNode;
  /** Segmented tabs or filters: right of the title on desktop, under it on phones. */
  controls?: ReactNode;
}

// The curved header every screen starts with. Desktop adds the logo and main navigation above the title.
export function PageHeader({
  title,
  phoneTitle,
  subtitle,
  back,
  leading,
  trailing,
  actions,
  controls,
}: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · Pesa Dashboard`;
  }, [title]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.topBar}>
          <Link to="/" className={styles.brand}>
            <Logo />
            <span>Budget</span>
          </Link>
          <nav aria-label="Main" className={styles.nav}>
            {DESKTOP_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={styles.navLink}>
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
        </div>

        <div className={styles.titleRow}>
          <div className={styles.phoneSlot}>
            {back ? (
              <HeaderIconLink to={back} label="Back">
                <Icon name="back" />
              </HeaderIconLink>
            ) : (
              leading
            )}
          </div>
          <div className={styles.titles}>
            <h1 className={styles.title}>
              <span className={styles.desktopOnly}>{title}</span>
              <span className={styles.phoneOnly}>{phoneTitle ?? title}</span>
            </h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <div className={styles.phoneSlot}>{trailing}</div>
          {(controls || actions) && (
            <div className={styles.controls}>
              {controls}
              {actions && <div className={styles.desktopOnly}>{actions}</div>}
            </div>
          )}
        </div>
      </header>
      <div className={styles.join} aria-hidden="true">
        <div />
      </div>
    </>
  );
}

export function HeaderIconLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link to={to} aria-label={label} className={styles.iconButton}>
      {children}
    </Link>
  );
}
