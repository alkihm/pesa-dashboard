import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "@/app/routes";
import { fakeAuth, fakeSession } from "@/test/fakeAuth";
import { SessionProvider } from "./SessionProvider";
import { safeNext } from "./session";
import { SignInScreen } from "./SignInScreen";

function renderApp(path: string, auth: ReturnType<typeof fakeAuth>, devForm = false) {
  const withForm = routes.map((r) =>
    r.path === "/sign-in" ? { ...r, element: <SignInScreen devForm={devForm} /> } : r,
  );
  const router = createMemoryRouter(withForm, { initialEntries: [path] });
  render(
    <SessionProvider auth={() => auth.client}>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
  return router;
}

describe("sign-in gate", () => {
  it("sends a signed-out visitor to sign-in and remembers where they were going", async () => {
    const router = renderApp("/month?m=2026-10", fakeAuth(null));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(router.state.location.search).toBe("?next=%2Fmonth%3Fm%3D2026-10");
  });

  it("opens the app straight away with a saved session", async () => {
    renderApp("/month", fakeAuth(fakeSession()));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Month");
  });

  it("returns to the screen asked for once signed in", async () => {
    const auth = fakeAuth(null);
    const router = renderApp("/activity", auth);
    await screen.findByRole("heading", { name: "Sign in" });

    act(() => auth.emit(fakeSession()));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Activity");
    expect(router.state.location.pathname).toBe("/activity");
  });

  it("goes back to sign-in after signing out", async () => {
    const auth = fakeAuth(fakeSession());
    const router = renderApp("/", auth);
    await screen.findByRole("navigation", { name: "Main" });

    act(() => auth.emit(null));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
  });
});

describe("sign-in screen", () => {
  it("starts Google sign-in and comes back to sign-in with the next screen", async () => {
    const auth = fakeAuth(null);
    renderApp("/sign-in?next=%2Fbills", auth);
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(auth.mock.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/sign-in?next=%2Fbills` },
    });
  });

  it("shows an error when Google sign-in does not start", async () => {
    const auth = fakeAuth(null);
    auth.mock.signInWithOAuth.mockResolvedValueOnce({ data: null, error: new Error("offline") } as never);
    renderApp("/sign-in", auth);
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Google sign-in did not start");
  });

  it("hides the email form outside dev builds", async () => {
    renderApp("/sign-in", fakeAuth(null));
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByRole("form", { name: "Developer sign-in" })).not.toBeInTheDocument();
  });

  it("signs in with email in dev builds and opens the overview", async () => {
    const auth = fakeAuth(null);
    renderApp("/sign-in", auth, true);
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "sample@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-a-real-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with email" }));

    expect(auth.mock.signInWithPassword).toHaveBeenCalledWith({
      email: "sample@example.test",
      password: "not-a-real-password",
    });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Overview");
  });

  it("says so when the email or password is wrong", async () => {
    const auth = fakeAuth(null);
    auth.mock.signInWithPassword.mockResolvedValueOnce({ data: null, error: new Error("invalid") } as never);
    renderApp("/sign-in", auth, true);
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "sample@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with email" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
  });
});

describe("safeNext", () => {
  it.each([
    ["/month?m=2026-10", "/month?m=2026-10"],
    [null, "/"],
    ["", "/"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
    ["/sign-in?next=/x", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
