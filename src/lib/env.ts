// The app's configuration, read once from Vite's env. Values come from `.env.local` in a workspace and
// from the hosting settings in previews and production — never from the code.

export interface Env {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

type RawEnv = Record<string, string | boolean | undefined>;

const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;

export function readEnv(raw: RawEnv): Env {
  const value = (name: (typeof REQUIRED)[number]) => {
    const v = raw[name];
    return typeof v === "string" ? v.trim() : "";
  };

  const missing = REQUIRED.filter((name) => !value(name));
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}. Copy .env.example to .env.local and fill it in.`);
  }

  const supabaseUrl = value("VITE_SUPABASE_URL");
  if (!URL.canParse(supabaseUrl)) throw new Error(`VITE_SUPABASE_URL is not a URL: ${supabaseUrl}`);

  return { supabaseUrl, supabaseAnonKey: value("VITE_SUPABASE_ANON_KEY") };
}

let cached: Env | undefined;

// Throws on first use if anything is missing, so a misconfigured build fails at start-up, not mid-session.
export function env(): Env {
  cached ??= readEnv(import.meta.env);
  return cached;
}
