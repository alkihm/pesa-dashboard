// The two Google calls the backup needs, with Web Crypto and fetch only, so the same file runs in the Edge
// Function (Deno) and in tests (Node): a service-account access token, and "replace this tab's contents".

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

type Fetch = typeof fetch;

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function importKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

/** Signed JWT for the OAuth service-account flow (RS256), valid for 10 minutes. */
export async function serviceAccountJwt(sa: ServiceAccount, scope: string, nowMs: number): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri, iat: now, exp: now + 600 }),
  )}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importKey(sa.private_key),
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${b64url(sig)}`;
}

export async function accessToken(
  sa: ServiceAccount,
  fetchFn: Fetch = fetch,
  nowMs = Date.now(),
): Promise<string> {
  const assertion = await serviceAccountJwt(sa, "https://www.googleapis.com/auth/spreadsheets", nowMs);
  const res = await fetchFn(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token)
    throw new Error(`Google token: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim());
  return body.access_token;
}

/** Makes the tab if missing, clears it and writes `values` from A1. Running it again gives the same tab. */
export async function replaceTab(
  token: string,
  sheetId: string,
  tab: string,
  values: (string | number)[][],
  fetchFn: Fetch = fetch,
): Promise<void> {
  const api = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await fetchFn(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`Google Sheets ${init.method ?? "GET"} → ${res.status} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  };
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'`);

  const meta = (await call(`${api}?fields=sheets.properties.title`)) as {
    sheets?: { properties: { title: string } }[];
  };
  if (!meta.sheets?.some((s) => s.properties.title === tab)) {
    await call(`${api}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
    });
  }
  await call(`${api}/values/${range}:clear`, { method: "POST", body: "{}" });
  await call(`${api}/values/${range}!A1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}
