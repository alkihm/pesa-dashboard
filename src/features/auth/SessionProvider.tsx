import { useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase";
import { SessionContext, type AuthClient, type SessionState } from "./session";

const defaultAuth = () => supabase().auth;

// Reads the saved session once (it lives in this device's storage, so it works offline), then follows sign-in,
// sign-out and token refreshes.
export function SessionProvider({
  auth = defaultAuth,
  children,
}: {
  auth?: () => AuthClient;
  children: ReactNode;
}) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const client = auth();
    let active = true;
    const apply = (session: Parameters<Parameters<AuthClient["onAuthStateChange"]>[0]>[1]) => {
      if (active) setState(session ? { status: "signed-in", session } : { status: "signed-out" });
    };

    void client.getSession().then(({ data }) => apply(data.session));
    const { data } = client.onAuthStateChange((_event, session) => apply(session));

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [auth]);

  const value = useMemo(() => ({ state, auth }), [state, auth]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
