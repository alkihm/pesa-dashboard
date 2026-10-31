import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "./routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
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
  ])("renders %s inside the shell", (path, title) => {
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Tabs" })).toBeInTheDocument();
  });

  it("renders sign-in without the shell", () => {
    renderAt("/sign-in");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("marks the current section in the desktop nav and the phone tabs", () => {
    renderAt("/accounts/savings");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Accounts" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");

    renderAt("/bills");
    const tabs = screen.getAllByRole("navigation", { name: "Tabs" }).at(-1)!;
    expect(within(tabs).getByRole("link", { name: "Bills" })).toHaveAttribute("aria-current", "page");
  });

  it("shows a not-found page for unknown paths", () => {
    renderAt("/nope");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Not found");
  });
});
