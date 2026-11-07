import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendBillAction } from "@/features/bills/actions";
import type { BillRow } from "@/features/bills/data";
import { insertRows } from "@/features/transactions/data";
import { createQueue, resetOfflineQueue, type OfflineQueue } from "@/lib/offline/queue";
import { memoryStore, type QueueItem } from "@/lib/offline/store";
import { fakeServer } from "@/test/fakeServer";
import { differences } from "./conflicts";
import { OfflineBanner } from "./OfflineBanner";
import { SyncCard } from "./SyncCard";
import { bannerText, queueLabel } from "./sync";

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: "q1",
  seq: 1,
  userId: "",
  createdAt: "2026-11-07T06:30:00.000Z",
  label: "Paid · Internet",
  op: { kind: "update", table: "bill_months", id: "m1", version: 3, changes: { status: "paid" } },
  state: "waiting",
  ...over,
});

describe("what the offline bar says", () => {
  it("counts what waits while offline", () => {
    expect(bannerText(false, { waiting: 3, attention: 0 })).toBe("Offline · 3 changes will sync");
    expect(bannerText(false, { waiting: 1, attention: 0 })).toBe("Offline · 1 change will sync");
    expect(bannerText(false, { waiting: 0, attention: 0 })).toBe(
      "Offline · changes you make are kept on this device",
    );
  });

  it("says it is sending once back online, and nothing when all is sent", () => {
    expect(bannerText(true, { waiting: 2, attention: 0 })).toBe("Sending 2 changes…");
    expect(bannerText(true, { waiting: 0, attention: 0 })).toBeNull();
  });

  it("asks for a choice before anything else", () => {
    expect(bannerText(false, { waiting: 2, attention: 1 })).toBe("1 change needs your choice");
    expect(bannerText(true, { waiting: 0, attention: 2 })).toBe("2 changes need your choice");
  });

  it("labels the queue in Settings", () => {
    expect(queueLabel({ waiting: 0, attention: 0 })).toBe("All changes sent");
    expect(queueLabel({ waiting: 3, attention: 0 })).toBe("3 changes waiting to sync");
    expect(queueLabel({ waiting: 1, attention: 1 })).toBe("1 change waiting to sync · 1 to check");
  });
});

describe("a conflict's differences", () => {
  it("lists only the fields of my edit that now differ, in words", () => {
    const conflict = item({
      state: "conflict",
      op: {
        kind: "update",
        table: "transactions",
        id: "t1",
        version: 2,
        changes: { note: "lunch", category_id: "c1", needs_review: false },
      },
      server: { id: "t1", version: 3, note: "dinner", category_id: "c2", needs_review: false },
    });
    expect(differences(conflict)).toEqual([
      { field: "Note", mine: "lunch", theirs: "dinner" },
      { field: "Category", mine: "your choice", theirs: "another choice" },
    ]);
  });
});

function renderWith(queue: OfflineQueue, element = <SyncCard />) {
  resetOfflineQueue(queue);
  const router = createMemoryRouter([{ path: "/", element }]);
  render(<RouterProvider router={router} />);
}

describe("Settings · Data & sync", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says all is sent when the queue is empty", async () => {
    renderWith(createQueue({ store: memoryStore() }));
    expect(await screen.findByText("All changes sent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🔄 Sync now" })).toBeEnabled();
  });

  it("lists waiting changes and sends them with Send", async () => {
    const server = fakeServer({ bill_months: [{ id: "m1", status: "due", version: 3 }] });
    const queue = createQueue({ store: memoryStore([item()]) });
    await queue.setUser(null);
    resetOfflineQueue(queue);
    const supabase = await import("@/lib/supabase");
    vi.spyOn(supabase, "supabase").mockReturnValue(server.db);

    renderWith(queue);
    expect(screen.getByText("1 change waiting to sync")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Changes on this device" });
    expect(within(list).getByText("Paid · Internet")).toBeInTheDocument();
    expect(within(list).getByText("Waiting")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("All changes sent")).toBeInTheDocument();
    expect(server.tables.bill_months![0]).toMatchObject({ status: "paid", version: 4 });
  });

  it("shows a conflict with both versions; Keep theirs drops mine", async () => {
    const conflict = item({ state: "conflict", server: { id: "m1", status: "skipped", version: 4 } });
    const queue = createQueue({ store: memoryStore([conflict]) });
    await queue.setUser(null);
    renderWith(queue);

    expect(screen.getByText("Changed elsewhere")).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Status/ });
    expect(within(row).getByText("Paid")).toBeInTheDocument();
    expect(within(row).getByText("Skipped")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep theirs" }));
    expect(await screen.findByText("All changes sent")).toBeInTheDocument();
  });

  it("offers only Discard for a change the database refused", async () => {
    const queue = createQueue({
      store: memoryStore([item({ state: "failed", error: "Already in the ledger" })]),
    });
    await queue.setUser(null);
    renderWith(queue);
    expect(screen.getByText("Not saved: Already in the ledger")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep mine" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByText("All changes sent")).toBeInTheDocument();
  });
});

describe("the offline bar", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the count while offline and follows the queue", async () => {
    const queue = createQueue({ store: memoryStore([item(), item({ id: "q2", seq: 2 })]) });
    await queue.setUser(null);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWith(queue, <OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Offline · 2 changes will sync");

    await act(() => queue.discard("q2"));
    expect(screen.getByRole("status")).toHaveTextContent("Offline · 1 change will sync");
  });

  it("links to Settings when a change needs a choice, and hides when all is sent online", async () => {
    const queue = createQueue({ store: memoryStore([item({ state: "conflict", server: null })]) });
    await queue.setUser(null);
    renderWith(queue, <OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("1 change needs your choice");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/settings#sync");

    await act(() => queue.discard("q1"));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("writes from the screens while offline", () => {
  const bill: BillRow = {
    id: "m1",
    billId: "b1",
    month: "2026-11-01",
    name: "Internet",
    emoji: "🌐",
    accountId: null,
    due_on: "2026-11-05",
    amount_cents: 350_000,
    status: "due",
    paidAt: null,
    transactionId: null,
    viaSms: false,
    version: 3,
  };

  it("Pay is kept on the device and goes out later with the version it started from", async () => {
    const server = fakeServer({ bill_months: [{ id: "m1", status: "due", version: 3 }] });
    const queue = createQueue({ store: memoryStore(), online: () => server.up });
    resetOfflineQueue(queue);
    server.up = false;

    expect(await sendBillAction(server.db, bill, "pay")).toEqual({ ok: true, version: 4, queued: true });
    expect(queue.items()).toEqual([
      expect.objectContaining({ label: "Paid · Internet", op: expect.objectContaining({ version: 3 }) }),
    ]);

    server.up = true;
    await queue.replay(server.db);
    expect(server.tables.bill_months![0]).toMatchObject({ status: "paid", version: 4 });
  });

  it("a new transaction is kept on the device with its own ids", async () => {
    const server = fakeServer();
    const queue = createQueue({ store: memoryStore(), online: () => server.up });
    resetOfflineQueue(queue);
    server.up = false;

    const rows = [{ id: "t1", amount_cents: 1200 }] as unknown as Parameters<typeof insertRows>[1];
    expect(await insertRows(server.db, rows, "Added · 12")).toEqual({ queued: true });
    server.up = true;
    await waitFor(async () => expect((await queue.replay(server.db)).sent).toBe(1));
    expect(server.tables.transactions).toEqual([{ id: "t1", amount_cents: 1200, version: 1 }]);
  });
});
