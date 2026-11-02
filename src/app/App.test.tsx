import type { Session } from "@supabase/supabase-js";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { fakeAuth, fakeSession } from "@/test/fakeAuth";
import { fakePin } from "@/test/fakePin";
import { routes } from "./routes";

function renderAt(path: string, session: Session | null = fakeSession()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const { client } = fakeAuth(session);
  render(
    <SessionProvider auth={() => client} pin={() => fakePin().api}>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  return router;
}

describe("app shell", () => {
  it.each([
    ["/", "Overview"],
    ["/activity", "Activity"],
    ["/activity/abc", "Transaction"],
    ["/transactions/new", "Add transaction"],
    ["/month", "Month"],
    ["/bills", "Bills & budget"],
    ["/review", "Review & reconcile"],
    ["/accounts", "Accounts"],
    ["/accounts/savings", "Savings"],
    ["/accounts/debt", "Debt"],
    ["/accounts/new", "New account"],
    ["/categories", "Categories"],
    ["/categories/new", "New category"],
    ["/settings", "Settings"],
    ["/report", "Month report"],
  ])("renders %s inside the shell", async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Tabs" })).toBeInTheDocument();
  });

  it("renders sign-in without the shell", async () => {
    renderAt("/sign-in", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("marks the current section in the desktop nav and the phone tabs", async () => {
    renderAt("/accounts/savings");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Accounts" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");

    renderAt("/bills");
    await screen.findAllByRole("navigation", { name: "Tabs" });
    const tabs = screen.getAllByRole("navigation", { name: "Tabs" }).at(-1)!;
    expect(within(tabs).getByRole("link", { name: "Bills" })).toHaveAttribute("aria-current", "page");
  });

  it("shows a not-found page for unknown paths", async () => {
    renderAt("/nope");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Not found");
  });
});
