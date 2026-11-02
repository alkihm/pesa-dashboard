import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { Logo } from "@/app/shell/Logo";
import { useSession } from "./session";
import styles from "./auth.module.css";

// Every screen except sign-in sits behind this: no session, no data. Screens can assume a signed-in user.
export function RequireSession({ children }: { children: ReactNode }) {
  const state = useSession();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <main className={styles.splash} aria-busy="true" aria-label="Loading">
        <Logo size={72} />
      </main>
    );
  }

  if (state.status === "signed-out") {
    const next = location.pathname + location.search;
    const to = next === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;
    return <Navigate to={to} replace />;
  }

  return children;
}
