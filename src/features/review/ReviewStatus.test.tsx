import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

import { PageHeader } from "@/app/shell/PageHeader";
import type { Db } from "@/lib/supabase";
import { ReviewStatusProvider } from "./ReviewStatus";

const DAY = 86_400_000;

/** Invented: one account off by 100 or matching, and one review `daysAgo` days ago. */
function fakeDb({ off = 0, daysAgo }: { off?: number; daysAgo?: number }) {
  let reads = 0;
  const data = (table: string) => {
    if (table === "account_balances")
      return [{ account_id: "a", difference_cents: off, snapshot_at: "2026-11-01T07:00:00Z" }];
    if (table === "settings") return { review_interval_days: 3 };
    if (table === "reviews")
      return daysAgo === undefined
        ? []
        : [
            {
              id: "r",
              completed_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
              result: "all_match",
              review_checks: [],
            },
          ];
    return [];
  };
  const db = {
    from(table: string) {
      if (table === "account_balances") reads++;
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
          Promise.resolve({ data: data(table), error: null }).then(ok, bad),
      };
      for (const name of ["select", "eq", "is", "not", "order", "limit", "maybeSingle"])
        builder[name] = () => builder;
      return builder;
    },
  };
  return { db: db as unknown as Db, reads: () => reads };
}

function renderHeader(fake?: ReturnType<typeof fakeDb>) {
  const header = <PageHeader title="Overview" />;
  const router = createMemoryRouter([
    {
      path: "/",
      element: fake ? <ReviewStatusProvider db={() => fake.db}>{header}</ReviewStatusProvider> : header,
    },
  ]);
  render(<RouterProvider router={router} />);
}

describe("review dot in the header", () => {
  it("shows green next to the title and opens Review", async () => {
    renderHeader(fakeDb({ daysAgo: 1 }));
    const dot = await screen.findByRole("link", {
      name: /^Review up to date\. Last done \d+ \w{3}\. Open Review\.$/,
    });
    expect(dot).toHaveAttribute("href", "/review");
  });

  it("says when a review is due or overdue", async () => {
    renderHeader(fakeDb({ daysAgo: 4 }));
    expect(await screen.findByRole("link", { name: /^Review due\./ })).toBeInTheDocument();
  });

  it("turns red on a mismatch", async () => {
    renderHeader(fakeDb({ off: -100, daysAgo: 0 }));
    expect(
      await screen.findByRole("link", { name: "Needs reconciling. Last done today. Open Review." }),
    ).toBeInTheDocument();
  });

  it("loads again when the app comes back to the front", async () => {
    const fake = fakeDb({ daysAgo: 1 });
    renderHeader(fake);
    await screen.findByRole("link", { name: /^Review up to date/ });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fake.reads()).toBe(2);
  });

  it("shows nothing outside the signed-in shell", () => {
    renderHeader();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open Review/ })).not.toBeInTheDocument();
  });
});
