import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../lib/database.types";
import { activityQuery, nextCursor, parseSearch, type ActivityRow } from "./query";

// A client that is never called: the tests read the URL a query would request.
const db = createClient<Database>("http://127.0.0.1:54321", "test-anon-key");
const params = (q: ReturnType<typeof activityQuery>) =>
  (q as unknown as { url: URL }).url.searchParams;

describe("parseSearch", () => {
  it("reads amounts with commas, cents or a KES prefix", () => {
    expect(parseSearch("1,500")).toEqual({ text: "1 500", amountCents: 150000 });
    expect(parseSearch("250.50").amountCents).toBe(25050);
    expect(parseSearch("KES 45,000").amountCents).toBe(4500000);
  });

  it("treats words as text only", () => {
    expect(parseSearch("  naivas ")).toEqual({ text: "naivas" });
    expect(parseSearch("12abc")).toEqual({ text: "12abc" });
  });

  it("removes characters that would break the filter", () => {
    expect(parseSearch('a,(b)"c%d*e\\').text).toBe("a b c d e");
  });
});

describe("activityQuery", () => {
  it("asks for one page, newest first, without deleted rows", () => {
    const p = params(activityQuery(db, { filter: "all", search: "" }));
    expect(p.get("deleted_at")).toBe("is.null");
    expect(p.get("order")).toBe("occurred_at.desc,id.desc");
    expect(p.get("limit")).toBe("50");
    expect(p.get("or")).toBeNull();
  });

  it("applies the review and notes filters", () => {
    expect(params(activityQuery(db, { filter: "review", search: "" })).get("needs_review")).toBe("eq.true");
    const notes = params(activityQuery(db, { filter: "notes", search: "" }));
    expect(notes.getAll("note")).toEqual(["not.is.null", "neq."]);
  });

  it("searches payee, note and the amount either way", () => {
    expect(params(activityQuery(db, { filter: "all", search: "200" })).get("or")).toBe(
      '(payee.ilike."*200*",note.ilike."*200*",amount_cents.eq.20000,amount_cents.eq.-20000)',
    );
  });

  it("joins search and paging under one and(…)", () => {
    const cursor = { occurredAt: "2026-10-20T06:00:00+00:00", id: "b" };
    expect(params(activityQuery(db, { filter: "all", search: "", cursor })).get("or")).toBe(
      '(occurred_at.lt."2026-10-20T06:00:00+00:00",and(occurred_at.eq."2026-10-20T06:00:00+00:00",id.lt.b))',
    );
    expect(params(activityQuery(db, { filter: "all", search: "kcb", cursor })).get("or")).toBe(
      '(and(or(payee.ilike."*kcb*",note.ilike."*kcb*"),' +
        'or(occurred_at.lt."2026-10-20T06:00:00+00:00",and(occurred_at.eq."2026-10-20T06:00:00+00:00",id.lt.b))))',
    );
  });
});

describe("nextCursor", () => {
  const rows = [{ id: "a", occurred_at: "t2" }, { id: "b", occurred_at: "t1" }] as ActivityRow[];

  it("continues from the last row of a full page", () => {
    expect(nextCursor(rows, 2)).toEqual({ occurredAt: "t1", id: "b" });
  });

  it("stops on a short page", () => {
    expect(nextCursor(rows, 3)).toBeUndefined();
    expect(nextCursor([], 3)).toBeUndefined();
  });
});
