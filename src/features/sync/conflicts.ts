// How a conflict is shown: the fields my queued edit sets that now differ on the server.

import type { QueueItem, Row } from "@/lib/offline/store";

export const when = new Intl.DateTimeFormat("en-KE", {
  timeZone: "Africa/Nairobi",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const FIELDS: Record<string, string> = {
  status: "Status",
  paid_at: "Paid",
  skip_reason: "Skip reason",
  approved_at: "Approved",
  category_id: "Category",
  note: "Note",
  needs_review: "To review",
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return when.format(new Date(value));
  if (field.endsWith("_id")) return "another choice";
  if (field === "status" && typeof value === "string") return value.charAt(0).toUpperCase() + value.slice(1);
  return String(value);
}

/** The fields my edit sets that now differ on the server. */
export function differences(item: QueueItem): { field: string; mine: string; theirs: string }[] {
  if (item.op.kind !== "update" || !item.server) return [];
  const server: Row = item.server;
  return Object.entries(item.op.changes)
    .filter(([field, value]) => (server[field] ?? null) !== (value ?? null))
    .map(([field, value]) => {
      const mine = show(field, value);
      const theirs = show(field, server[field]);
      return {
        field: FIELDS[field] ?? field.replaceAll("_", " "),
        mine: field.endsWith("_id") ? "your choice" : mine,
        theirs,
      };
    });
}
