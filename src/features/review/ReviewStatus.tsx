import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { useLive } from "@/lib/live";
import type { ReviewStatus } from "@/lib/review";
import { supabase, type Db } from "@/lib/supabase";
import { loadReviewStatus } from "./data";
import styles from "./ReviewStatus.module.css";
import { ReviewStatusContext, useReviewStatus } from "./statusContext";

// [4.3] The review status for the whole app: loaded once in the shell, again whenever the app comes back to the
// front, and on request after a review or a fix. The header dot on every screen reads it.
export function ReviewStatusProvider({ db = supabase, children }: { db?: () => Db; children: ReactNode }) {
  const [status, setStatus] = useState<ReviewStatus>();
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  // [4.6] Also after a new SMS, an edit, a review or a new interval in Settings.
  const fresh = useLive(["settings", "reviews", "accounts", "transactions", "sms_messages"]);

  useEffect(() => {
    let live = true;
    // A failed read keeps the last status; the Review screen shows its own errors.
    loadReviewStatus(db()).then(
      (s) => live && setStatus(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [db, version, fresh]);

  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [refresh]);

  const value = useMemo(() => ({ status, refresh }), [status, refresh]);
  return <ReviewStatusContext.Provider value={value}>{children}</ReviewStatusContext.Provider>;
}

const TONE = { green: styles.green, amber: styles.amber, red: styles.red };

/** A coloured dot next to every page title that opens Review. Nothing until the status has loaded. */
export function ReviewDot() {
  const status = useReviewStatus()?.status;
  if (!status) return null;
  const label = `${status.short}. ${status.last}. Open Review.`;
  return (
    <Link
      to="/review"
      className={styles.dotLink}
      aria-label={label}
      title={`${status.short} · ${status.last}`}
    >
      <span aria-hidden="true" className={`${styles.dot} ${TONE[status.tone]}`} />
    </Link>
  );
}
