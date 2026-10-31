// Fails if a hex colour appears in a stylesheet other than src/styles/tokens.css.
// TypeScript files are covered by the no-restricted-syntax rule in eslint.config.js.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const allowed = join(root, "src", "styles", "tokens.css");
const hex = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;

function* cssFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* cssFiles(path);
    else if (entry.name.endsWith(".css")) yield path;
  }
}

let failures = 0;
for (const file of cssFiles(join(root, "src"))) {
  if (file === allowed) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const match of line.matchAll(hex)) {
        failures++;
        console.error(`${relative(root, file).split(sep).join("/")}:${i + 1}  ${match[0]} — use a token`);
      }
    });
}

if (failures) {
  console.error(`\n${failures} hex colour(s) outside src/styles/tokens.css`);
  process.exit(1);
}
