import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { SessionContext } from "@/features/auth/session";
import { alertsFrom } from "@/lib/alerts";
import { getMonthStartDay, setMonthStartDay } from "@/lib/budgetMonth";
import { liveTick } from "@/lib/live";
import { getCurrency, setCurrency } from "@/lib/money";
import type { Db } from "@/lib/supabase";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { fakeAuth, fakeSession } from "@/test/fakeAuth";
import { fakePin } from "@/test/fakePin";
import { ago, backupState, smsState } from "./data";
import { intervalNote, pinProblem } from "./rules";
import { SettingsScreen } from "./SettingsScreen";

const NOW = new Date("2026-11-08T09:00:00Z");

function fakeDb({
  settings = { review_interval_days: 3, alerts: {} } as Record<string, unknown> | null,
  upsertError = null as { message: string } | null,
} = {}) {
  const writes: { table: string; values: unknown; options: unknown }[] = [];
  const answers: Record<string, unknown> = {
    settings: { data: settings, error: null },
    sms_messages: { data: { received_at: "2026-11-08T08:56:00Z" }, error: null },
    backup_runs: {
      data: {
        status: "ok",
        started_at: "2026-11-07T20:30:00Z",
        finished_at: "2026-11-07T20:30:22Z",
        rows_written: 1284,
        tabs: ["2020", "2021", "2026"],
        error: null,
      },
      error: null,
    },
  };
  const counts: Record<string, number> = { accounts: 12, categories: 18, payee_rules: 46, bills: 9 };
  const db = {
    from: (table: string) => {
      let head = false;
      let notNull = false;
      const q = {
        select: (_: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
        order: () => q,
        limit: () => q,
        is: () => q,
        eq: () => q,
        gte: () => q,
        not: () => ((notNull = true), q),
        maybeSingle: () => q,
        upsert: (values: unknown, options: unknown) => {
          writes.push({ table, values, options });
          // Like the database: a saved row is what the next read returns.
          if (!upsertError && table === "settings")
            answers.settings = { data: { ...(settings ?? {}), ...(values as object) }, error: null };
          return Promise.resolve({ data: null, error: upsertError });
        },
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve(
            head
              ? { count: notNull ? 7 : counts[table], error: null }
              : (answers[table] ?? { data: null, error: null }),
          ).then(ok),
      };
      return q;
    },
  } as unknown as Db;
  return { db: () => db, writes };
}

function renderSettings(db = fakeDb(), pin = fakePin({ recentSignIn: true })) {
  const auth = fakeAuth();
  const router = createMemoryRouter(
    [{ path: "/settings", element: <SettingsScreen db={db.db} now={NOW} /> }],
    {
      initialEntries: ["/settings"],
    },
  );
  render(
    <SessionContext.Provider
      value={{
        state: { status: "signed-in", session: fakeSession() },
        auth: () => auth.client,
        pin: () => pin.api,
      }}
    >
      <RouterProvider router={router} />
    </SessionContext.Provider>,
  );
  return { ...db, pin, auth };
}

const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;

describe("Settings · appearance", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("starts on System and switches to light and back", () => {
    renderSettings();
    const appearance = within(card("🎨 Appearance"));
    expect(appearance.getByRole("button", { name: "📱 System" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(appearance.getByRole("button", { name: "☀️ Light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    fireEvent.click(appearance.getByRole("button", { name: "📱 System" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});

describe("Settings · data & sync", () => {
  it("shows the last SMS and the last Sheet backup", async () => {
    renderSettings();
    const sync = within(card("🔄 Data & sync"));
    expect(await sync.findByText("Last SMS received 4 min ago")).toBeInTheDocument();
    expect(sync.getByText("1,284 rows · 2020–2026 · synced 13 h ago")).toBeInTheDocument();
    expect(sync.getAllByText("✓ Connected")).toHaveLength(2);
  });

  it("words each source state", () => {
    expect(smsState(null, NOW)).toMatchObject({ tone: "grey", pill: "No SMS yet" });
    expect(smsState("2026-11-05T09:00:00Z", NOW)).toMatchObject({ tone: "amber", pill: "Quiet" });
    // [5.5] Same rule as the intake alert: 8 daytime hours. NOW is 12:00 Nairobi; 21:00 the evening before is 1 + 5.
    expect(smsState("2026-11-07T18:00:00Z", NOW)).toMatchObject({ tone: "green" });
    expect(smsState("2026-11-07T15:00:00Z", NOW)).toMatchObject({ tone: "amber", pill: "Quiet" }); // 4 + 5
    expect(smsState("2026-11-08T08:56:00Z", NOW, { parsed: 6, toReview: 4 })).toMatchObject({
      tone: "amber",
      pill: "Not reading",
      meta: "Last SMS received 4 min ago · 4 of 10 in a day need a look",
    });
    expect(backupState(null, NOW)).toMatchObject({ tone: "grey", pill: "Not run yet" });
    const failed = {
      status: "failed" as const,
      startedAt: "2026-11-07T20:30:00Z",
      finishedAt: "2026-11-07T20:30:05Z",
      rows: null,
      tabs: [],
      error: "Sheet not shared",
    };
    expect(backupState(failed, NOW)).toMatchObject({
      tone: "red",
      pill: "Failed",
      meta: "Sheet not shared · 13 h ago",
    });
    expect(ago("2026-11-08T09:00:20Z", NOW)).toBe("just now");
    expect(ago("2026-11-06T09:00:00Z", NOW)).toBe("2 days ago");
  });
});

describe("Settings · reminders and alerts", () => {
  it("saves a new review interval and tells the screens", async () => {
    const { writes } = renderSettings();
    await screen.findByRole("button", { name: "3 days" });
    const reminders = within(card("🔔 Reminders & alerts"));
    expect(reminders.getByText(intervalNote(3))).toBeInTheDocument();
    const before = liveTick(["settings"]);

    fireEvent.click(reminders.getByRole("button", { name: "5 days" }));
    expect(reminders.getByRole("button", { name: "5 days" })).toHaveAttribute("aria-pressed", "true");
    expect(
      reminders.getByText(
        "Status turns amber after 5 days and red after 11 days, or right away if a balance is off.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      table: "settings",
      values: { review_interval_days: 5, alerts: alertsFrom({}), currency: "KES", month_start_day: 1 },
      options: { onConflict: "user_id" },
    });
    await waitFor(() => expect(liveTick(["settings"])).toBe(before + 1));
  });

  it("turns an alert off, keeping the others", async () => {
    const { writes } = renderSettings(
      fakeDb({ settings: { review_interval_days: 3, alerts: { weekly_summary: true } } }),
    );
    const sw = await screen.findByRole("switch", { name: "A bill is overdue" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Weekly summary on Sunday" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(writes).toHaveLength(1));
    expect((writes[0]!.values as { alerts: Record<string, boolean> }).alerts).toMatchObject({
      bill_overdue: false,
      weekly_summary: true,
      review_due: true,
    });
  });

  it("puts a switch back when saving fails", async () => {
    renderSettings(fakeDb({ upsertError: { message: "Failed to save" } }));
    const sw = await screen.findByRole("switch", { name: "Review is due" });
    fireEvent.click(sw);
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved: Failed to save");
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("starts from defaults before anything was saved", async () => {
    renderSettings(fakeDb({ settings: null }));
    expect(await screen.findByRole("button", { name: "3 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: "Weekly summary on Sunday" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});

describe("Settings · PIN", () => {
  const fill = (current: string, next: string, repeat: string) => {
    fireEvent.change(screen.getByLabelText("Current PIN"), { target: { value: current } });
    fireEvent.change(screen.getByLabelText("New PIN"), { target: { value: next } });
    fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: repeat } });
    // The phone row that opens the form has the same name; this is the form's submit button.
    const submit = screen
      .getAllByRole("button", { name: "Change PIN" })
      .find((b) => b.getAttribute("type") === "submit");
    fireEvent.click(submit!);
  };

  it("checks the boxes before sending anything", () => {
    expect(pinProblem("1357", "246802", "246802")?.field).toBe("current");
    expect(pinProblem("135790", "2468", "2468")?.field).toBe("next");
    expect(pinProblem("135790", "135790", "135790")?.text).toMatch(/different/);
    expect(pinProblem("135790", "246802", "246803")?.field).toBe("repeat");
    expect(pinProblem("135790", "246802", "246802")).toBeNull();
  });

  it("changes the PIN after checking the current one", async () => {
    const { pin } = renderSettings();
    fill("135790", "246802", "246802");
    expect(await screen.findByRole("status")).toHaveTextContent("PIN changed");
    expect(pin.mock.verify).toHaveBeenCalledWith("135790");
    expect(pin.mock.set).toHaveBeenCalledWith("246802");
  });

  it("refuses a wrong current PIN and says how many tries are left", async () => {
    const { pin } = renderSettings();
    fill("000000", "246802", "246802");
    expect(await screen.findByRole("alert")).toHaveTextContent("That is not your current PIN. 4 tries left.");
    expect(pin.mock.set).not.toHaveBeenCalled();
  });

  it("asks to confirm with Google when the sign-in is too old", async () => {
    const pin = fakePin();
    pin.mock.set.mockRejectedValueOnce(new Error("sign in with Google again to change the PIN"));
    const { auth } = renderSettings(fakeDb(), pin);
    fill("135790", "246802", "246802");
    const alert = await screen.findByText(/confirm it is you with Google first/);
    fireEvent.click(
      within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", {
        name: "Confirm with Google",
      }),
    );
    await waitFor(() => expect(auth.mock.signInWithOAuth).toHaveBeenCalled());
    expect(sessionStorage.getItem("pesa:pin-reset")).toBe("1");
    sessionStorage.clear();
  });
});

describe("Settings · currency and month start", () => {
  afterEach(() => {
    setCurrency("KES");
    setMonthStartDay(1);
  });

  it("saves a currency and a start day, applies both and tells every screen", async () => {
    const { writes } = renderSettings();
    const appearance = within(card("🎨 Appearance"));
    const currency = await appearance.findByLabelText("Currency");
    expect(currency).toHaveValue("KES");
    expect(appearance.getByText(/Months follow the calendar/)).toBeInTheDocument();
    const before = liveTick(["transactions"]);

    fireEvent.change(appearance.getByLabelText("Budget month starts"), { target: { value: "25" } });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.values).toMatchObject({ month_start_day: 25, currency: "KES" });
    expect(getMonthStartDay()).toBe(25);
    expect(liveTick(["transactions"])).toBeGreaterThan(before);
    expect(appearance.getByText(/This month runs \d+ \w+ – \d+ \w+/)).toBeInTheDocument();

    fireEvent.change(currency, { target: { value: "UGX" } });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]!.values).toMatchObject({ currency: "UGX", month_start_day: 25 });
    expect(getCurrency()).toBe("UGX");
  });
});

describe("Settings · links", () => {
  it("links to the report, import/export and the manage screens with counts", async () => {
    renderSettings();
    const io = within(card("📤 Import & export"));
    expect(io.getByRole("link", { name: /Month report \(PDF\)/ })).toHaveAttribute("href", "/report");
    expect(io.getByRole("link", { name: /Upload transactions/ })).toHaveAttribute("href", "/import");
    expect(io.getByRole("link", { name: /Export everything/ })).toHaveAttribute("href", "/export");
    const manage = within(card("🗂️ Manage"));
    expect(await manage.findByText("12 accounts · 7 SMS matching")).toBeInTheDocument();
    expect(manage.getByText("18 categories · 46 payee rules")).toBeInTheDocument();
    expect(manage.getByText("9 bills · due-date colours")).toBeInTheDocument();
  });
});
