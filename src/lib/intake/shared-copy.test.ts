// The intake Edge Function runs copies of src/lib/sms and src/lib/intake (scripts/sync-functions.mjs).
// This fails when a copy is missing, stale or left over.

const isSource = (path: string) => !path.endsWith(".test.ts") && !path.endsWith("/fixtures.ts");

const strip = (files: Record<string, string>, prefix: string) =>
  Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => isSource(path))
      .map(([path, text]) => [path.slice(prefix.length), text]),
  );

describe("Edge Function copies of shared code", () => {
  it("match src/lib exactly — run `node scripts/sync-functions.mjs`", () => {
    const source = strip(
      import.meta.glob(["/src/lib/sms/*.ts", "/src/lib/intake/*.ts"], {
        query: "?raw",
        import: "default",
        eager: true,
      }),
      "/src/lib/",
    );
    const copies = strip(
      import.meta.glob("/supabase/functions/_shared/lib/**/*.ts", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
      "/supabase/functions/_shared/lib/",
    );
    expect(Object.keys(copies).sort()).toEqual(Object.keys(source).sort());
    for (const [path, text] of Object.entries(source)) expect(copies[path], path).toBe(text);
  });
});
