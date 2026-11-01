import { accessToken, replaceTab, serviceAccountJwt, type ServiceAccount } from "./google";
import { backupTables, HEADER, nairobiDate, type BackupTransaction } from "./rows";

const t = (o: Partial<BackupTransaction>): BackupTransaction => ({
  occurred_at: "2026-01-02T09:00:00Z",
  amount_cents: -70100,
  kind: "spending",
  channel: "till",
  payee: "DEMO SHOP",
  note: null,
  ref: "TSA0000001",
  source: "sms",
  needs_review: false,
  original_currency: null,
  original_minor: null,
  account: "M-PESA",
  category: "Groceries",
  ...o,
});

describe("backupTables", () => {
  it("splits by Nairobi year, sorts by time and keeps the familiar columns", () => {
    const tables = backupTables([
      t({ occurred_at: "2026-01-02T09:00:00Z" }),
      // 22:30 UTC on 31 Dec is already 1 Jan in Nairobi
      t({ occurred_at: "2025-12-31T22:30:00Z", kind: "income", amount_cents: 50000, category: "Salary" }),
      t({ occurred_at: "2025-06-01T09:00:00Z", kind: "transfer", category: null, payee: null, ref: null }),
    ]);
    expect(Object.keys(tables).sort()).toEqual(["2025", "2026"]);
    expect(tables["2025"]).toEqual([
      HEADER,
      ["2025-06-01", "2025-06", "M-PESA", "till", "", "Transfer", "", "KES", -701, -701, "", "", "", "sms"],
    ]);
    expect(tables["2026"]!.slice(1).map((r) => [r[0], r[5], r[9]])).toEqual([
      ["2026-01-01", "Income", 500],
      ["2026-01-02", "Expense", -701],
    ]);
  });

  it("shows the original currency amount and the review flag", () => {
    const [, row] = backupTables([
      t({ original_currency: "USD", original_minor: 1200, amount_cents: -154800, needs_review: true }),
    ])["2026"]!;
    expect([row![7], row![8], row![9], row![12]]).toEqual(["USD", 12, -1548, "yes"]);
  });

  it("gives Nairobi dates", () => {
    expect(nairobiDate("2026-03-31T21:00:00Z")).toBe("2026-04-01");
    expect(nairobiDate("2026-03-31T20:59:59Z")).toBe("2026-03-31");
  });
});

// A throwaway key made in the test, so the signature can be checked for real.
async function testAccount(): Promise<{ sa: ServiceAccount; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;
  return {
    sa: {
      client_email: "backup@demo.iam.example",
      private_key: pem,
      token_uri: "https://oauth.example/token",
    },
    publicKey: pair.publicKey,
  };
}

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

describe("Google service account", () => {
  it("signs a JWT Google can verify", async () => {
    const { sa, publicKey } = await testAccount();
    const jwt = await serviceAccountJwt(sa, "scope-x", Date.UTC(2026, 0, 1));
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromB64url(p!)))).toEqual({
      iss: "backup@demo.iam.example",
      scope: "scope-x",
      aud: "https://oauth.example/token",
      iat: 1767225600,
      exp: 1767226200,
    });
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      fromB64url(s!),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it("exchanges it for an access token, and reports Google's error", async () => {
    const { sa } = await testAccount();
    const good = vi.fn(async () => new Response(JSON.stringify({ access_token: "tok" })));
    expect(await accessToken(sa, good as unknown as typeof fetch)).toBe("tok");
    expect(String((good.mock.calls[0] as unknown[])[0])).toBe("https://oauth.example/token");

    const bad = async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad key" }), { status: 400 });
    await expect(accessToken(sa, bad as unknown as typeof fetch)).rejects.toThrow(
      "Google token: invalid_grant bad key",
    );
  });
});

describe("replaceTab", () => {
  const sheet = (tabs: string[]) => {
    const calls: { method: string; url: string; body?: string }[] = [];
    const fetchFn = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", url, body: init.body as string | undefined });
      return new Response(
        JSON.stringify(
          url.includes("fields=") ? { sheets: tabs.map((title) => ({ properties: { title } })) } : {},
        ),
      );
    });
    return { calls, fetchFn: fetchFn as unknown as typeof fetch };
  };

  it("adds a missing tab, clears it and writes from A1", async () => {
    const { calls, fetchFn } = sheet(["Sheet1"]);
    await replaceTab("tok", "SHEET", "2026", [["Date"], ["2026-01-01"]], fetchFn);
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "POST", "PUT"]);
    expect(calls[1]!.body).toContain('"addSheet"');
    expect(calls[2]!.url).toContain("/values/'2026':clear");
    expect(calls[3]!.url).toContain("/values/'2026'!A1?valueInputOption=RAW");
    expect(JSON.parse(calls[3]!.body!)).toEqual({ values: [["Date"], ["2026-01-01"]] });
  });

  it("does not add a tab that exists, so running again is the same", async () => {
    const { calls, fetchFn } = sheet(["2026"]);
    await replaceTab("tok", "SHEET", "2026", [["Date"]], fetchFn);
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "PUT"]);
  });

  it("throws with Google's message on failure", async () => {
    const fail = async () => new Response("quota", { status: 429 });
    await expect(replaceTab("tok", "S", "2026", [], fail as unknown as typeof fetch)).rejects.toThrow(
      "Google Sheets GET → 429 quota",
    );
  });
});
