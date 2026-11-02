// Checks the PIN on this device when the database cannot be reached (D-014). After each PIN the database
// accepts or sets, a PBKDF2 hash of it is kept in local storage, with the count and the lock the database last
// reported. Offline, the PIN is checked against that hash and wrong tries count here: 5 lock it for 15
// minutes, as online. Whenever the database answers, it decides.
//
// Six digits are a million guesses, so anyone who can read this device's storage can recover the PIN — but they
// can already use the session stored next to it. That is why the PIN should not be an M-PESA or bank PIN.

import type { PinApi, PinCheck, PinState } from "./pin";

const KEY = "pesa:pin-offline";
const TRIES = 5;
const LOCK_MS = 15 * 60_000;
export const ITERATIONS = 600_000;

interface Saved {
  userId: string;
  salt: string;
  iterations: number;
  hash: string;
  failed: number;
  lockedUntil: number | null;
}

function load(userId: string): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return saved?.userId === userId ? saved : null;
  } catch {
    return null;
  }
}

function save(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(KEY, JSON.stringify(saved));
    else localStorage.removeItem(KEY);
  } catch {
    // Nothing to keep it in; offline unlock is then unavailable on this device.
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** No answer at all — not a refusal. Database refusals carry a Postgres error code. */
function unreachable(error: unknown) {
  return !navigator.onLine || !(error as { code?: string } | null)?.code;
}

const lockOf = (saved: Saved) =>
  saved.lockedUntil !== null && saved.lockedUntil > Date.now() ? new Date(saved.lockedUntil) : null;

export function withOfflineCheck(online: PinApi, userId: string, iterations = ITERATIONS): PinApi {
  const remember = async (pin: string) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(pin, salt, iterations);
    save({ userId, salt: toBase64(salt), iterations, hash, failed: 0, lockedUntil: null });
  };

  // Keeps this device's count and lock in step with the database's.
  const mirror = (triesLeft: number, lockedUntil: Date | null) => {
    const saved = load(userId);
    if (!saved) return;
    save({
      ...saved,
      failed: lockedUntil ? 0 : TRIES - triesLeft,
      lockedUntil: lockedUntil?.getTime() ?? null,
    });
  };

  const checkHere = async (saved: Saved, pin: string): Promise<PinCheck> => {
    const lock = lockOf(saved);
    if (lock) return { ok: false, triesLeft: 0, lockedUntil: lock };
    if ((await derive(pin, fromBase64(saved.salt), saved.iterations)) === saved.hash) {
      save({ ...saved, failed: 0, lockedUntil: null });
      return { ok: true, triesLeft: TRIES, lockedUntil: null };
    }
    const failed = saved.failed + 1;
    if (failed >= TRIES) {
      const until = Date.now() + LOCK_MS;
      save({ ...saved, failed: 0, lockedUntil: until });
      return { ok: false, triesLeft: 0, lockedUntil: new Date(until) };
    }
    save({ ...saved, failed, lockedUntil: null });
    return { ok: false, triesLeft: TRIES - failed, lockedUntil: null };
  };

  return {
    async status(): Promise<PinState> {
      try {
        const state = await online.status();
        if (state.hasPin) mirror(state.triesLeft, state.lockedUntil);
        else save(null);
        return state;
      } catch (error) {
        const saved = load(userId);
        if (!saved || !unreachable(error)) throw error;
        const lock = lockOf(saved);
        return {
          hasPin: true,
          triesLeft: lock ? 0 : TRIES - saved.failed,
          lockedUntil: lock,
          recentSignIn: false,
          offline: true,
        };
      }
    },
    async verify(pin) {
      let result: PinCheck;
      try {
        result = await online.verify(pin);
      } catch (error) {
        const saved = load(userId);
        if (!saved || !unreachable(error)) throw error;
        return checkHere(saved, pin);
      }
      // Hashing takes a moment on a phone; the unlock does not wait for it.
      if (result.ok) void remember(pin);
      else mirror(result.triesLeft, result.lockedUntil);
      return result;
    },
    async set(pin) {
      await online.set(pin);
      void remember(pin);
    },
  };
}
