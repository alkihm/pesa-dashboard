import { Outlet } from "react-router";
import { ReviewStatusProvider } from "@/features/review/ReviewStatus";
import { TabBar } from "./TabBar";
import styles from "./AppShell.module.css";

// Frame for every signed-in screen: each page renders its own PageHeader, the phone tab bar sits below. The review
// status ([4.3]) is loaded here once, for the dot in every header.
export function AppShell() {
  return (
    <ReviewStatusProvider>
      <div className={styles.shell}>
        <main className={styles.main}>
          <Outlet />
        </main>
        <TabBar />
      </div>
    </ReviewStatusProvider>
  );
}
