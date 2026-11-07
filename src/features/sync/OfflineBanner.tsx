import { Link } from "react-router";

import { bannerText, summarise, useSync } from "./sync";
import styles from "./Sync.module.css";

/** The bar at the top of every screen while offline, sending, or when a queued change needs a choice. */
export function OfflineBanner() {
  const { items, online } = useSync();
  const summary = summarise(items);
  const text = bannerText(online, summary);
  if (!text) return null;

  const attention = summary.attention > 0;
  return (
    <div role="status" className={`${styles.banner} ${attention ? styles.bannerBad : ""}`}>
      <span aria-hidden="true">{attention ? "⚠️" : online ? "🔄" : "📴"}</span>
      <span>{text}</span>
      {attention && (
        <Link className={styles.bannerLink} to="/settings#sync">
          Open
        </Link>
      )}
    </div>
  );
}
