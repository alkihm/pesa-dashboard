// [4.6] Pull down from the top of any screen on a phone to read everything again. The installed app has no
// browser reload, so this is the way to ask for the latest by hand. Touch only; desktop never sees it.

import { useEffect, useRef, useState } from "react";

import { announce } from "@/lib/live";
import { pullDistance, PULL_TRIGGER, SHOWN_MS } from "./pull";
import styles from "./Sync.module.css";

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);
  const distance = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0]!.clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      distance.current = pullDistance(e.touches[0]!.clientY - start.current);
      setPull(distance.current);
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      const pulled = distance.current >= PULL_TRIGGER;
      distance.current = 0;
      setPull(0);
      if (!pulled) return;
      setRefreshing(true);
      announce();
      window.setTimeout(() => setRefreshing(false), SHOWN_MS);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (!refreshing && pull < 8) return null;
  const ready = pull >= PULL_TRIGGER;
  return (
    <div
      className={styles.pull}
      style={{ transform: `translate(-50%, ${refreshing ? 56 : pull - 20}px)` }}
      role={refreshing ? "status" : undefined}
    >
      <span aria-hidden="true" className={refreshing ? styles.spin : undefined}>
        {refreshing ? "↻" : ready ? "↑" : "↓"}
      </span>
      {refreshing ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
    </div>
  );
}
