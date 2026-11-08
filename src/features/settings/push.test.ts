import { describe, expect, it } from "vitest";

import { deviceLabel, keyBytes, pushState, type PushEnv } from "./push";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

const env = (over: Partial<PushEnv> = {}): PushEnv => ({
  userAgent: CHROME,
  maxTouchPoints: 0,
  standalone: false,
  hasPush: true,
  permission: "default",
  vapidKey: "BKey",
  ...over,
});

describe("whether this device can get notifications", () => {
  it("asks iPhone and iPad users in a Safari tab to install the app first", () => {
    expect(pushState(env({ userAgent: IPHONE, hasPush: false }), false)).toBe("needs-install");
    expect(pushState(env({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 }), false)).toBe("needs-install");
    expect(pushState(env({ userAgent: IPHONE, standalone: true }), false)).toBe("off");
  });

  it("reads the browser, the build and the permission", () => {
    expect(pushState(env({ hasPush: false }), false)).toBe("unsupported");
    expect(pushState(env({ vapidKey: null }), false)).toBe("not-configured");
    expect(pushState(env({ permission: "denied" }), false)).toBe("denied");
    expect(pushState(env(), false)).toBe("off");
    expect(pushState(env({ permission: "granted" }), true)).toBe("on");
    expect(pushState(env({ permission: "default" }), true)).toBe("off");
  });

  it("names the device for the subscription list", () => {
    expect(deviceLabel(IPHONE)).toBe("iPhone");
    expect(deviceLabel(IPAD_DESKTOP_MODE, 5)).toBe("iPad");
    expect(deviceLabel(IPAD_DESKTOP_MODE, 0)).toBe("Mac");
    expect(deviceLabel(CHROME)).toBe("Windows");
  });

  it("turns the base64url key into bytes", () => {
    expect([...keyBytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });
});
