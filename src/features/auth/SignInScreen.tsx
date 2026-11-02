import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";

import { Logo } from "@/app/shell/Logo";
import { Button } from "@/components/Button";
import { TextField } from "@/components/Field";
import { safeNext, signInWithGoogle, useSessionContext } from "./session";
import styles from "./auth.module.css";

// Google is the only way in. Dev builds also get an email form for the local stack's seed user, which has no
// Google identity. After sign-in, PinGate asks for the PIN (or for one to be chosen).
export function SignInScreen({ devForm = import.meta.env.DEV }: { devForm?: boolean }) {
  const { state, auth } = useSessionContext();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (state.status === "signed-in") return <Navigate to={next} replace />;

  const google = async () => {
    setBusy(true);
    setError(undefined);
    const { error } = await signInWithGoogle(auth(), next);
    if (error) {
      setError("Google sign-in did not start. Try again.");
      setBusy(false);
    }
  };

  const withPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    const { error } = await auth().signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (error) setError("Wrong email or password.");
  };

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <Logo size={72} />
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.text}>Use your Google account. You set a PIN for quick unlock after that.</p>

        <Button block onClick={google} disabled={busy || state.status === "loading"}>
          Continue with Google
        </Button>

        {devForm && (
          <form className={styles.devForm} onSubmit={withPassword} aria-label="Developer sign-in">
            <p className={styles.devLabel}>Dev build only · local seed user</p>
            <TextField label="Email" name="email" type="email" autoComplete="username" required />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            <Button type="submit" variant="ghost" block disabled={busy}>
              Sign in with email
            </Button>
          </form>
        )}

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
