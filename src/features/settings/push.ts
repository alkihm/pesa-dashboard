// [4.4] Web push on this device: whether it can, turning it on (permission → subscription → push_subscriptions row)
// and off, and a test from the notify function. On an iPhone, web push only works in the app added to the home
// screen (iOS 16.4+), so Safari in a tab is told to install it first.

import type { Db } from "@/lib/supabase";

export type PushState =
  | "unsupported" // no service worker / push in this browser
  | "needs-install" // iPhone or iPad in a Safari tab: add to the home screen first
  | "not-configured" // this build has no VAPID public key
  | "denied" // the user blocked notifications for the app
  | "off"
  | "on";

/** What the page can see of the browser; tests pass their own. */
export interface PushEnv {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasPush: boolean;
  permission: NotificationPermission | null;
  vapidKey: string | null;
}

export function browserPushEnv(vapidKey: string | null): PushEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
    hasPush: "serviceWorker" in nav && "PushManager" in window && "Notification" in window,
    permission: "Notification" in window ? Notification.permission : null,
    vapidKey,
  };
}

const isIos = (e: PushEnv) =>
  /iPhone|iPad|iPod/.test(e.userAgent) || (/Macintosh/.test(e.userAgent) && e.maxTouchPoints > 1);

/** The state before looking for an existing subscription ("off" may turn out to be "on"). */
export function pushState(e: PushEnv, subscribed: boolean): PushState {
  if (isIos(e) && !e.standalone) return "needs-install";
  if (!e.hasPush) return "unsupported";
  if (!e.vapidKey) return "not-configured";
  if (e.permission === "denied") return "denied";
  return subscribed && e.permission === "granted" ? "on" : "off";
}

/** "iPhone", "Android", "Mac", "Windows" or "This device", for the device list. */
export function deviceLabel(userAgent: string, maxTouchPoints = 0) {
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(userAgent)) return "Android";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return "Windows";
  return "This device";
}

/** The VAPID key as the Push API wants it (base64url → bytes). */
export function keyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await registration()).pushManager.getSubscription();
}

export async function turnOn(db: Db, vapidKey: string): Promise<"on" | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(vapidKey) as BufferSource,
    }));
  const { endpoint, keys } = sub.toJSON();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      endpoint: endpoint!,
      keys: keys ?? {},
      device_label: deviceLabel(navigator.userAgent, navigator.maxTouchPoints),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    await sub.unsubscribe();
    throw new Error(error.message);
  }
  return "on";
}

export async function turnOff(db: Db) {
  const sub = await currentSubscription();
  if (!sub) return;
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  if (error) throw new Error(error.message);
  await sub.unsubscribe();
}

/** Asks the notify function to send one test notification to this user's devices; resolves to how many. */
export async function sendTest(db: Db): Promise<number> {
  const { data, error } = await db.functions.invoke<{ ok: boolean; devices?: number; error?: string }>(
    "notify",
    {
      body: { test: true },
    },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error ?? "The test was not sent");
  return data.devices ?? 0;
}
