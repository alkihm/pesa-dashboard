import { readEnv } from "./env";

const valid = {
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_ANON_KEY: "test-anon-key",
};

describe("readEnv", () => {
  it("returns the config when every value is set", () => {
    expect(readEnv(valid)).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "test-anon-key",
    });
  });

  it("names every missing value", () => {
    expect(() => readEnv({})).toThrow("Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY");
  });

  it("treats blank values as missing", () => {
    expect(() => readEnv({ ...valid, VITE_SUPABASE_ANON_KEY: "  " })).toThrow(
      "Missing env: VITE_SUPABASE_ANON_KEY",
    );
  });

  it("rejects a URL that does not parse", () => {
    expect(() => readEnv({ ...valid, VITE_SUPABASE_URL: "not a url" })).toThrow("is not a URL");
  });
});
