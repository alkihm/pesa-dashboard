import { parseCsv, toCsv } from "./csv";

describe("toCsv / parseCsv", () => {
  it("starts with a byte order mark and uses CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a,b\r\n1,x\r\n");
  });

  it("quotes only what needs it", () => {
    expect(
      toCsv(["v"], [["plain"], ["a,b"], ['say "hi"'], ["line\nbreak"], [" padded "]]).split("\r\n"),
    ).toEqual(["﻿v", "plain", '"a,b"', '"say ""hi"""', '"line\nbreak"', '" padded "', ""]);
  });

  it("tells null from an empty string", () => {
    const text = toCsv(["a", "b", "c"], [[null, "", "x"]]);
    expect(text).toContain('\r\n,"",x\r\n');
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      [null, "", "x"],
    ]);
  });

  it("writes booleans, numbers and JSON as text", () => {
    expect(parseCsv(toCsv(["b", "n", "j"], [[true, -150000, { review: true }]]))[1]).toEqual([
      "true",
      "-150000",
      '{"review":true}',
    ]);
  });

  it("reads back what it wrote, emoji and all", () => {
    const rows = [
      ["🏠 Rent", 'He said "pay", then left', "multi\r\nline", null],
      ["", "ok", "a,b,c", "end"],
    ];
    const parsed = parseCsv(toCsv(["w", "x", "y", "z"], rows));
    expect(parsed.slice(1)).toEqual(rows);
  });

  it("reads LF-only files and a last line without a line break", () => {
    expect(parseCsv("a,b\n1,2\n3,")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", null],
    ]);
  });

  it("refuses an unclosed quote", () => {
    expect(() => parseCsv('a\n"open')).toThrow("not closed");
  });
});
