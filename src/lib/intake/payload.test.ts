import { readPayload, sameKey, smsHash } from "./payload";

const NOW = new Date("2026-01-05T08:00:00Z");

describe("readPayload", () => {
  it("reads the old single-message shape with the key in the body", () => {
    expect(
      readPayload(
        { secret: "k1", sender: "MPESA", text: " hello ", received: "2026-01-02T10:00:00Z" },
        null,
        NOW,
      ),
    ).toEqual({
      key: "k1",
      action: "ingest",
      messages: [{ sender: "MPESA", body: "hello", receivedAt: new Date("2026-01-02T10:00:00Z") }],
    });
  });

  it("splits the old batch format and keeps each record's date", () => {
    const r = readPayload(
      { secret: "k1", batch: "2026-01-02T10:00:00Z|||first|||END\n|||second|||END\n" },
      null,
      NOW,
    );
    expect(r).toMatchObject({
      action: "ingest",
      messages: [
        { sender: "", body: "first", receivedAt: new Date("2026-01-02T10:00:00Z") },
        { sender: "", body: "second", receivedAt: NOW },
      ],
    });
  });

  it("reads the new shapes", () => {
    expect(
      readPayload({ sender: "KCB", body: "x", received_at: "2026-01-03T00:00:00Z" }, "k2", NOW),
    ).toMatchObject({
      key: "k2",
      messages: [{ sender: "KCB", body: "x" }],
    });
    expect(
      readPayload(
        {
          messages: [
            { sender: "A", body: "1" },
            { sender: "B", body: "" },
          ],
        },
        "k2",
        NOW,
      ),
    ).toMatchObject({
      messages: [{ sender: "A", body: "1" }],
    });
  });

  it("prefers the header key over the body", () => {
    expect(readPayload({ secret: "body" }, "header", NOW).key).toBe("header");
  });

  it("recognises a status request", () => {
    expect(readPayload({ secret: "k", action: "status" }, null, NOW)).toEqual({ key: "k", action: "status" });
  });

  it("falls back to now for a missing or broken date, and tolerates junk", () => {
    expect(readPayload({ text: "x", received: "not a date" }, null, NOW)).toMatchObject({
      messages: [{ receivedAt: NOW }],
    });
    expect(readPayload("junk", null, NOW)).toEqual({ key: undefined, action: "ingest", messages: [] });
    expect(readPayload(null, null, NOW)).toEqual({ key: undefined, action: "ingest", messages: [] });
  });
});

describe("sameKey", () => {
  it("accepts only the exact key", () => {
    expect(sameKey("abc123", "abc123")).toBe(true);
    expect(sameKey("abc124", "abc123")).toBe(false);
    expect(sameKey("abc", "abc123")).toBe(false);
    expect(sameKey(undefined, "abc123")).toBe(false);
    expect(sameKey("", "")).toBe(false);
  });
});

describe("smsHash", () => {
  it("is stable sha-256 hex of sender and body", async () => {
    const a = await smsHash("MPESA", "hello");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await smsHash("MPESA", "hello")).toBe(a);
    expect(await smsHash("KCB", "hello")).not.toBe(a);
  });
});
