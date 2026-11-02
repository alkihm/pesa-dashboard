import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { fakeAuth, fakeSession } from "@/test/fakeAuth";
import { fakePin } from "@/test/fakePin";
import { pinApi, rememberUnlocked, wantsReset } from "./pin";
import { RequireSession } from "./RequireSession";
import { SessionProvider } from "./SessionProvider";

function renderGate(pin: ReturnType<typeof fakePin>, auth = fakeAuth(fakeSession())) {
  const router = createMemoryRouter(
    [
      { path: "/sign-in", element: <h1>Sign in</h1> },
      {
        path: "*",
        element: (
          <RequireSession>
            <h1>The app</h1>
          </RequireSession>
        ),
      },
    ],
    { initialEntries: ["/month"] },
  );
  render(
    <SessionProvider auth={() => auth.client} pin={() => pin.api}>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  return { auth, router };
}

const key = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const typePin = (digits: string) => [...digits].forEach(key);
const dots = () => screen.getByRole("status");

afterEach(() => sessionStorage.clear());

describe("PIN unlock", () => {
  it("opens the app straight after a Google sign-in", async () => {
    renderGate(fakePin({ recentSignIn: true }));
    expect(await screen.findByRole("heading", { name: "The app" })).toBeInTheDocument();
  });

  it("asks an older session for the PIN and opens on the right one", async () => {
    const pin = fakePin({ recentSignIn: false });
    renderGate(pin);
    expect(await screen.findByRole("heading", { name: "Enter your PIN" })).toBeInTheDocument();
    expect(screen.getByText("🔒 Locked")).toBeInTheDocument();

    typePin("13579");
    expect(dots()).toHaveAccessibleName("5 of 6 digits entered");
    typePin("0");
    expect(await screen.findByRole("heading", { name: "The app" })).toBeInTheDocument();
    expect(pin.mock.verify).toHaveBeenCalledWith("135790");
  });

  it("does not ask again in the same tab", async () => {
    const pin = fakePin({ recentSignIn: false });
    rememberUnlocked(fakeSession().user.id);
    renderGate(pin);
    expect(await screen.findByRole("heading", { name: "The app" })).toBeInTheDocument();
    expect(pin.mock.status).not.toHaveBeenCalled();
  });

  it("says how many tries are left after a wrong PIN, and clears the dots", async () => {
    renderGate(fakePin({ recentSignIn: false }));
    await screen.findByRole("heading", { name: "Enter your PIN" });

    typePin("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong PIN · 4 tries left");
    expect(dots()).toHaveAccessibleName("0 of 6 digits entered");
  });

  it("locks after the fifth wrong PIN and turns the keypad off", async () => {
    renderGate(fakePin({ recentSignIn: false, triesLeft: 1 }));
    await screen.findByRole("heading", { name: "Enter your PIN" });

    typePin("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Too many tries · try again at \d\d:\d\d$/);
    expect(screen.getByRole("button", { name: "5" })).toBeDisabled();
  });

  it("shows a lock that is already running", async () => {
    renderGate(fakePin({ recentSignIn: false, lockedUntil: new Date(Date.now() + 60_000) }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many tries");
    expect(screen.getByRole("button", { name: "0" })).toBeDisabled();
  });

  it("takes typing from a keyboard", async () => {
    renderGate(fakePin({ recentSignIn: false }));
    await screen.findByRole("heading", { name: "Enter your PIN" });

    [..."1357"].forEach((k) => fireEvent.keyDown(window, { key: k }));
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(dots()).toHaveAccessibleName("3 of 6 digits entered");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dots()).toHaveAccessibleName("0 of 6 digits entered");
  });

  it("has Clear and Delete keys", async () => {
    renderGate(fakePin({ recentSignIn: false }));
    await screen.findByRole("heading", { name: "Enter your PIN" });

    typePin("123");
    key("Delete last digit");
    expect(dots()).toHaveAccessibleName("2 of 6 digits entered");
    key("Clear PIN");
    expect(dots()).toHaveAccessibleName("0 of 6 digits entered");
  });

  it("asks for a PIN to be chosen, twice, when there is none", async () => {
    const pin = fakePin({ pin: null, recentSignIn: false });
    renderGate(pin);
    expect(await screen.findByRole("heading", { name: "Choose a PIN" })).toBeInTheDocument();

    typePin("246801");
    expect(await screen.findByText("Enter it again to check")).toBeInTheDocument();
    typePin("246802");
    expect(await screen.findByRole("alert")).toHaveTextContent("Those did not match");
    expect(pin.mock.set).not.toHaveBeenCalled();

    typePin("246801");
    await screen.findByText("Enter it again to check");
    typePin("246801");
    expect(await screen.findByRole("heading", { name: "The app" })).toBeInTheDocument();
    expect(pin.mock.set).toHaveBeenCalledWith("246801");
  });

  it("resets through Google: leaves for Google, then asks for a new PIN", async () => {
    const { auth } = renderGate(fakePin({ recentSignIn: false }));
    await screen.findByRole("heading", { name: "Enter your PIN" });

    key("Forgot PIN? Reset with Google");
    expect(auth.mock.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/sign-in?next=%2Fmonth` },
    });
    expect(wantsReset()).toBe(true);
  });

  it("asks for a new PIN when back from Google after Forgot PIN", async () => {
    sessionStorage.setItem("pesa:pin-reset", "1");
    const pin = fakePin({ recentSignIn: true, lockedUntil: new Date(Date.now() + 60_000) });
    renderGate(pin);
    expect(await screen.findByRole("heading", { name: "Choose a new PIN" })).toBeInTheDocument();

    typePin("975310");
    await screen.findByText("Enter it again to check");
    typePin("975310");
    expect(await screen.findByRole("heading", { name: "The app" })).toBeInTheDocument();
    expect(pin.mock.set).toHaveBeenCalledWith("975310");
    expect(wantsReset()).toBe(false);
  });

  it("says when the PIN is being checked on this device", async () => {
    const pin = fakePin({ recentSignIn: false });
    pin.mock.status.mockResolvedValueOnce({
      hasPin: true,
      triesLeft: 5,
      lockedUntil: null,
      recentSignIn: false,
      offline: true,
    });
    renderGate(pin);
    expect(await screen.findByText("🔒 Offline · checked on this device")).toBeInTheDocument();
  });

  it("says when the PIN cannot be checked, and tries again", async () => {
    const pin = fakePin({ recentSignIn: true });
    pin.mock.status.mockRejectedValueOnce(new Error("offline"));
    renderGate(pin);
    expect(await screen.findByRole("heading", { name: "Can’t check your PIN" })).toBeInTheDocument();

    key("Try again");
    expect(await screen.findByRole("heading", { name: "The app" })).toBeInTheDocument();
  });

  it("asks again after another account signs in", async () => {
    const { auth } = renderGate(fakePin({ recentSignIn: true }));
    await screen.findByRole("heading", { name: "The app" });
    expect(sessionStorage.getItem("pesa:unlocked")).toBe(fakeSession().user.id);

    const other = fakeSession("other@example.test");
    other.user.id = "00000000-0000-4000-8000-000000000002";
    act(() => auth.emit(other));
    expect(await screen.findByRole("heading", { name: "The app" })).toBeInTheDocument();
    expect(sessionStorage.getItem("pesa:unlocked")).toBe(other.user.id);
  });
});

describe("pinApi", () => {
  it("maps the database replies", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "pin_status") {
        return {
          data: { has_pin: true, tries_left: 0, locked_until: "2026-11-02T10:15:00Z", recent_sign_in: false },
          error: null,
        };
      }
      if (name === "verify_pin")
        return { data: { ok: false, tries_left: 3, locked_until: null }, error: null };
      return { data: null, error: { code: "42501", message: "sign in with Google again" } };
    });
    const api = pinApi({ rpc } as never);

    expect(await api.status()).toEqual({
      hasPin: true,
      triesLeft: 0,
      lockedUntil: new Date("2026-11-02T10:15:00Z"),
      recentSignIn: false,
    });
    expect(await api.verify("000000")).toEqual({ ok: false, triesLeft: 3, lockedUntil: null });
    expect(rpc).toHaveBeenCalledWith("verify_pin", { p_pin: "000000" });
    await expect(api.set("111111")).rejects.toMatchObject({ code: "42501" });
  });
});
