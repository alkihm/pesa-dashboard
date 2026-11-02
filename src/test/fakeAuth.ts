// A stand-in for supabase().auth in tests: starts signed in or out, and lets a test sign in or out later.

import type { Session } from "@supabase/supabase-js";
import { vi } from "vitest";

import type { AuthClient } from "@/features/auth/session";

type Listener = Parameters<AuthClient["onAuthStateChange"]>[0];

export function fakeSession(email = "sample@example.test"): Session {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 4102444800,
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

export function fakeAuth(initial: Session | null = fakeSession()) {
  let current = initial;
  const listeners = new Set<Listener>();
  const emit = (session: Session | null) => {
    current = session;
    listeners.forEach((l) => void l(session ? "SIGNED_IN" : "SIGNED_OUT", session));
  };

  const client = {
    getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener);
      return {
        data: {
          subscription: { id: "test", callback: listener, unsubscribe: () => listeners.delete(listener) },
        },
      };
    }),
    signInWithOAuth: vi.fn(async () => ({
      data: { provider: "google", url: "https://example.test" },
      error: null,
    })),
    signInWithPassword: vi.fn(async () => {
      emit(fakeSession());
      return { data: { user: current!.user, session: current! }, error: null };
    }),
    signOut: vi.fn(async () => {
      emit(null);
      return { error: null };
    }),
  };

  return { client: client as unknown as AuthClient, mock: client, emit };
}
