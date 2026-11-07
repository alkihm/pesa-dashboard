// Settings · Data & sync, the queue part ([4.5]): what waits on this device, Send, and a choice for each change
// that met a newer version on the server. Settings ([4.9]) passes the Shortcut and Sheet rows as `sources`.

import type { ReactNode } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import type { QueueItem } from "@/lib/offline/store";
import { differences, when } from "./conflicts";
import { queueLabel, summarise, useSync } from "./sync";
import styles from "./Sync.module.css";

function Item({ item }: { item: QueueItem }) {
  const { keepMine, discard, syncing } = useSync();
  const diff = differences(item);

  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.itemLabel}>{item.label}</span>
        {item.state === "waiting" && <StatusPill tone="amber">Waiting</StatusPill>}
        {item.state === "conflict" && <StatusPill tone="red">Changed elsewhere</StatusPill>}
        {item.state === "failed" && <StatusPill tone="red">Refused</StatusPill>}
      </div>
      <span className={styles.itemMeta}>Made {when.format(new Date(item.createdAt))} on this device</span>

      {item.state === "conflict" && item.server && (
        <>
          <p className={styles.itemNote}>This was changed on another device after you made your change.</p>
          {diff.length > 0 && (
            <table className={styles.diff}>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Yours</th>
                  <th scope="col">Now</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((d) => (
                  <tr key={d.field}>
                    <th scope="row">{d.field}</th>
                    <td>{d.mine}</td>
                    <td>{d.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={styles.choice}>
            <Button size="sm" onClick={() => void keepMine(item.id)} disabled={syncing}>
              Keep mine
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void discard(item.id)}>
              Keep theirs
            </Button>
          </div>
        </>
      )}

      {item.state === "conflict" && !item.server && (
        <>
          <p className={styles.itemNote}>
            This was deleted on another device, so there is nothing to change.
          </p>
          <div className={styles.choice}>
            <Button size="sm" variant="ghost" onClick={() => void discard(item.id)}>
              Discard my change
            </Button>
          </div>
        </>
      )}

      {item.state === "failed" && (
        <>
          <p className={styles.itemNote}>Not saved: {item.error}</p>
          <div className={styles.choice}>
            <Button size="sm" variant="ghost" onClick={() => void discard(item.id)}>
              Discard
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export function SyncCard({ sources }: { sources?: ReactNode }) {
  const { items, online, syncing, syncNow } = useSync();
  const summary = summarise(items);
  const clear = items.length === 0;
  const tone = clear ? styles.queueClear : summary.waiting === 0 ? styles.queueBad : "";

  return (
    <Card title="🔄 Data & sync">
      {sources}
      <div id="sync" className={`${styles.queue} ${tone}`}>
        <span>
          <span aria-hidden="true">{clear ? "✓ " : summary.waiting === 0 ? "⚠️ " : "📴 "}</span>
          {queueLabel(summary)}
        </span>
        {summary.waiting > 0 && (
          <Button size="sm" variant="secondary" onClick={() => void syncNow()} disabled={!online || syncing}>
            {syncing ? "Sending…" : "Send"}
          </Button>
        )}
      </div>
      {!online && (
        <p className={styles.note}>Offline. Changes you make are kept on this device and sent later.</p>
      )}
      {items.length > 0 && (
        <ul className={styles.items} aria-label="Changes on this device">
          {items.map((item) => (
            <Item key={item.id} item={item} />
          ))}
        </ul>
      )}
      <Button block onClick={() => void syncNow()} disabled={!online || syncing}>
        🔄 {syncing ? "Syncing…" : "Sync now"}
      </Button>
    </Card>
  );
}
