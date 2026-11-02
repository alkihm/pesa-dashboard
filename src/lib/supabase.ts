// The app's one Supabase client, typed from the generated schema. Created on first use, so modules that import it
// load in tests without env. Sign-in and the session ([2.1]) build on this client; never create a second one.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { env } from "./env";

export type Db = SupabaseClient<Database>;

let client: Db | undefined;

export function supabase(): Db {
  client ??= createClient<Database>(env().supabaseUrl, env().supabaseAnonKey);
  return client;
}
