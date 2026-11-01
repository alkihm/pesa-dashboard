import { Outlet } from "react-router";
import { TabBar } from "./TabBar";
import styles from "./AppShell.module.css";

// Frame for every signed-in screen: each page renders its own PageHeader, the phone tab bar sits below.
export function AppShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
