import { NavLink } from "react-router";
import { Icon } from "./icons";
import { PHONE_TABS } from "./navigation";
import styles from "./TabBar.module.css";

export function TabBar() {
  return (
    <nav aria-label="Tabs" className={styles.bar}>
      {PHONE_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className={styles.tab}>
          <span className={styles.indicator} aria-hidden="true" />
          <Icon name={tab.icon} size={22} />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
