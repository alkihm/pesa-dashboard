// Local checks for what this branch changed, compared with origin/dev (or the ref given as the first argument).
// The full suite, the database tests and the end-to-end tests run once, in CI (D-017).
//
//   pnpm check:changed            Prettier + ESLint on changed files, typecheck, tests related to the changes
//   pnpm check:changed origin/main
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = process.argv[2] ?? "origin/dev";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const committed = git("diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`);
const working = git("diff", "--name-only", "--diff-filter=ACMR", "HEAD");
const untracked = git("ls-files", "--others", "--exclude-standard");
const files = [...new Set([committed, working, untracked].join("\n").split("\n").filter(Boolean))].filter(
  existsSync,
);

if (files.length === 0) {
  console.log(`Nothing changed against ${base}.`);
  process.exit(0);
}

const code = files.filter((f) => /\.(c|m)?(t|j)sx?$/.test(f));
const formatted = files.filter(
  (f) => /\.(c|m)?(t|j)sx?$|\.(json|css|ya?ml|html)$/.test(f) && f !== "pnpm-lock.yaml",
);

const steps = [
  formatted.length && ["Prettier", "pnpm", ["exec", "prettier", "--check", ...formatted]],
  code.length && ["ESLint", "pnpm", ["exec", "eslint", ...code]],
  ["No hex colours", "node", ["scripts/check-hex.mjs"]],
  ["Typecheck", "pnpm", ["typecheck"]],
  // Runs the tests whose imports reach a changed file; one worker, because Node on nascore crashes under load.
  [
    "Tests (changed)",
    "pnpm",
    ["exec", "vitest", "run", "--changed", base, "--passWithNoTests", "--maxWorkers=1"],
  ],
].filter(Boolean);

console.log(`${files.length} changed file(s) against ${base}.`);
for (const [name, cmd, args] of steps) {
  console.log(`\n▶ ${name}`);
  const { status } = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (status !== 0) {
    console.error(`\n✗ ${name} failed.`);
    process.exit(status ?? 1);
  }
}
console.log("\n✓ Changed-file checks passed. CI runs the full suite, the database tests and e2e.");
