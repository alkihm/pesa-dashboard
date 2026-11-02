// A stand-in for the PIN functions in tests. It keeps the count and the lock the way the database does.

import { vi } from "vitest";

import type { PinApi } from "@/features/auth/pin";

interface FakePinOptions {
  /** The PIN already set, or null for none. */
  pin?: string | null;
  recentSignIn?: boolean;
  triesLeft?: number;
  lockedUntil?: Date | null;
}

export function fakePin({
  pin = "135790",
  recentSignIn = true,
  triesLeft = 5,
  lockedUntil = null,
}: FakePinOptions = {}) {
  let current = pin;
  let tries = triesLeft;
  let lock = lockedUntil;
  const locked = () => lock !== null && lock.getTime() > Date.now();

  const api = {
    status: vi.fn(async () => ({
      hasPin: current !== null,
      triesLeft: locked() ? 0 : tries,
      lockedUntil: locked() ? lock : null,
      recentSignIn,
    })),
    verify: vi.fn(async (value: string) => {
      if (locked()) return { ok: false, triesLeft: 0, lockedUntil: lock };
      if (value === current) {
        tries = 5;
        return { ok: true, triesLeft: 5, lockedUntil: null };
      }
      tries -= 1;
      if (tries > 0) return { ok: false, triesLeft: tries, lockedUntil: null };
      tries = 5;
      lock = new Date(Date.now() + 15 * 60_000);
      return { ok: false, triesLeft: 0, lockedUntil: lock };
    }),
    set: vi.fn(async (value: string) => {
      current = value;
      tries = 5;
      lock = null;
    }),
  };

  return { api: api as PinApi, mock: api };
}
