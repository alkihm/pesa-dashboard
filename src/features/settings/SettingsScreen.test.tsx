import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { SettingsScreen } from "./SettingsScreen";

function renderSettings() {
  const router = createMemoryRouter([{ path: "/settings", element: <SettingsScreen /> }], {
    initialEntries: ["/settings"],
  });
  render(<RouterProvider router={router} />);
}

describe("Settings · appearance", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("starts on System when nothing is chosen", () => {
    renderSettings();
    expect(screen.getByRole("button", { name: "📱 System" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to light and back to following the device", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "☀️ Light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "📱 System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
