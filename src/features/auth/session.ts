// Who is signed in. SessionProvider keeps it current; screens read it with useSession().

import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

import type { Db } from "@/lib/supabase";
import type { PinApi } from "./pin";

export type SessionState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; session: Session };

/** The part of the Supabase client the session needs — small enough to fake in tests. */
export type AuthClient = Pick<
  Db["auth"],
  "getSession" | "onAuthStateChange" | "signInWithOAuth" | "signInWithPassword" | "signOut"
>;

export interface SessionContextValue {
  state: SessionState;
  auth: () => AuthClient;
  pin: (userId: string) => PinApi;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSessionContext() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

export function useSession(): SessionState {
  return useSessionContext().state;
}

/** Only same-site paths, so a crafted ?next= cannot send the browser elsewhere after sign-in. */
export function safeNext(next: string | null | undefined) {
  return next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/sign-in") ? next : "/";
}

/** Leaves for Google; it comes back to the sign-in screen with the session in the URL, which then opens `next`. */
export function signInWithGoogle(auth: AuthClient, next: string) {
  const redirectTo = `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`;
  return auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
}
