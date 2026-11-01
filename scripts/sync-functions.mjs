// Copies the shared code the Edge Functions use from src/lib into supabase/functions/_shared/lib.
// The edge runtime only sees the supabase/ folder, so it cannot import from src/ directly.
// Run after changing src/lib/sms or src/lib/intake: `node scripts/sync-functions.mjs`.
// src/lib/intake/shared-copy.test.ts fails while the copies are out of date.

import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const SHARED = ["sms", "intake"];
const from = "src/lib";
const to = "supabase/functions/_shared/lib";
const isSource = (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fixtures.ts";

rmSync(to, { recursive: true, force: true });
for (const dir of SHARED) {
  mkdirSync(join(to, dir), { recursive: true });
  for (const file of readdirSync(join(from, dir)).filter(isSource)) {
    cpSync(join(from, dir, file), join(to, dir, file));
  }
}
console.log(`Copied src/lib/{${SHARED.join(",")}} to ${to}`);
