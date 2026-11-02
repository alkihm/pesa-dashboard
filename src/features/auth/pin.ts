// The PIN unlock. The database keeps the hash and the count (pin_status, verify_pin, set_pin), and offlinePin.ts
// checks it on this device when the database cannot be reached. This tab remembers that it has been unlocked,
// so a reload does not ask again. Closing the app forgets it.

import type { Db } from "@/lib/supabase";

export const PIN_LENGTH = 6;

export interface PinState {
  hasPin: boolean;
  triesLeft: number;
  /** Set only while locked. */
  lockedUntil: Date | null;
  /** Signed in within the last 10 minutes: the PIN can be changed, and is not asked for. */
  recentSignIn: boolean;
  /** The database could not be reached; the PIN is checked on this device. */
  offline?: boolean;
}

export interface PinCheck {
  ok: boolean;
  triesLeft: number;
  lockedUntil: Date | null;
}

/** The three database functions — small enough to fake in tests. */
export interface PinApi {
  status(): Promise<PinState>;
  verify(pin: string): Promise<PinCheck>;
  set(pin: string): Promise<void>;
}

const date = (value: string | null) => (value ? new Date(value) : null);

export function pinApi(db: Pick<Db, "rpc">): PinApi {
  return {
    async status() {
      const { data, error } = await db.rpc("pin_status");
      if (error) throw error;
      return {
        hasPin: data.has_pin ?? false,
        triesLeft: data.tries_left ?? 0,
        lockedUntil: date(data.locked_until),
        recentSignIn: data.recent_sign_in ?? false,
      };
    },
    async verify(pin) {
      const { data, error } = await db.rpc("verify_pin", { p_pin: pin });
      if (error) throw error;
      return { ok: data.ok ?? false, triesLeft: data.tries_left ?? 0, lockedUntil: date(data.locked_until) };
    },
    async set(pin) {
      const { error } = await db.rpc("set_pin", { p_pin: pin });
      if (error) throw error;
    },
  };
}

// Session storage can be missing or blocked (private windows); then the tab simply asks again.
const UNLOCKED = "pesa:unlocked";
const RESET = "pesa:pin-reset";

function read(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Nothing to keep it in; the tab asks again next time.
  }
}

export const isUnlocked = (userId: string) => read(UNLOCKED) === userId;
export const rememberUnlocked = (userId: string) => write(UNLOCKED, userId);

/** "Forgot PIN?" sets this before leaving for Google; back with a fresh sign-in, the gate asks for a new PIN. */
export const askForReset = () => write(RESET, "1");
export const wantsReset = () => read(RESET) === "1";
export const clearReset = () => write(RESET, null);
