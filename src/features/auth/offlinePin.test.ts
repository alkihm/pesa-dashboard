import { fakePin } from "@/test/fakePin";
import { withOfflineCheck } from "./offlinePin";

const USER = "00000000-0000-4000-8000-000000000001";
const FAST = 1000; // PBKDF2 iterations; the app uses 600 000.
const noAnswer = Object.assign(new Error("TypeError: Failed to fetch"), { code: "" });
const refused = Object.assign(new Error("permission denied"), { code: "42501" });

/** Online until `goOffline()`; then every database call fails as if there were no connection. */
function setUp(options: Parameters<typeof fakePin>[0] = {}) {
  const pin = fakePin({ recentSignIn: false, ...options });
  const goOffline = () => {
    pin.mock.status.mockRejectedValue(noAnswer);
    pin.mock.verify.mockRejectedValue(noAnswer);
  };
  return { pin, goOffline, api: withOfflineCheck(pin.api, USER, FAST) };
}

/** Unlocks once online, which keeps the PIN's hash on this device. */
async function unlockOnline(api: ReturnType<typeof setUp>["api"]) {
  expect((await api.verify("135790")).ok).toBe(true);
  await vi.waitFor(() => expect(localStorage.getItem("pesa:pin-offline")).not.toBeNull());
}

afterEach(() => localStorage.clear());

describe("offline PIN check", () => {
  it("cannot help before the PIN has been entered online on this device", async () => {
    const { api, goOffline } = setUp();
    goOffline();
    await expect(api.status()).rejects.toBe(noAnswer);
    await expect(api.verify("135790")).rejects.toBe(noAnswer);
  });

  it("checks the PIN here once it has been entered online", async () => {
    const { api, goOffline } = setUp();
    await unlockOnline(api);
    expect(localStorage.getItem("pesa:pin-offline")).not.toContain("135790");

    goOffline();
    expect(await api.status()).toEqual({
      hasPin: true,
      triesLeft: 5,
      lockedUntil: null,
      recentSignIn: false,
      offline: true,
    });
    expect(await api.verify("135790")).toEqual({ ok: true, triesLeft: 5, lockedUntil: null });
  });

  it("counts wrong tries here and locks after the fifth", async () => {
    const { api, goOffline } = setUp();
    await unlockOnline(api);
    goOffline();

    expect(await api.verify("000000")).toEqual({ ok: false, triesLeft: 4, lockedUntil: null });
    for (let i = 0; i < 3; i++) await api.verify("000000");
    const locked = await api.verify("000000");
    expect(locked.ok).toBe(false);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect((await api.verify("135790")).ok).toBe(false);
    expect((await api.status()).lockedUntil).toEqual(locked.lockedUntil);
  });

  it("keeps a lock the database set when the connection drops", async () => {
    const { api, pin, goOffline } = setUp();
    await unlockOnline(api);
    for (let i = 0; i < 5; i++) await api.verify("000000"); // locked by the (fake) database
    expect(pin.mock.verify).toHaveBeenCalledTimes(6);

    goOffline();
    expect((await api.verify("135790")).ok).toBe(false);
    expect((await api.status()).triesLeft).toBe(0);
  });

  it("carries the database's count over", async () => {
    const { api, goOffline } = setUp();
    await unlockOnline(api);
    await api.verify("000000");
    await api.verify("000000");

    goOffline();
    expect((await api.status()).triesLeft).toBe(3);
  });

  it("does not stand in for the database when it refuses", async () => {
    const { api, pin } = setUp();
    await unlockOnline(api);
    pin.mock.verify.mockRejectedValue(refused);
    await expect(api.verify("135790")).rejects.toBe(refused);
  });

  it("ignores another user's saved PIN", async () => {
    const { api, pin } = setUp();
    await unlockOnline(api);
    const other = withOfflineCheck(pin.api, "00000000-0000-4000-8000-000000000002", FAST);
    pin.mock.status.mockRejectedValue(noAnswer);
    await expect(other.status()).rejects.toBe(noAnswer);
  });

  it("keeps a newly chosen PIN", async () => {
    const { api, goOffline } = setUp({ pin: null });
    await api.set("246801");
    await vi.waitFor(() => expect(localStorage.getItem("pesa:pin-offline")).not.toBeNull());

    goOffline();
    expect((await api.verify("246801")).ok).toBe(true);
  });

  it("forgets the saved PIN when the database has none", async () => {
    const { api, pin } = setUp();
    await unlockOnline(api);
    pin.mock.status.mockResolvedValueOnce({
      hasPin: false,
      triesLeft: 5,
      lockedUntil: null,
      recentSignIn: false,
    });
    await api.status();
    expect(localStorage.getItem("pesa:pin-offline")).toBeNull();
  });
});
