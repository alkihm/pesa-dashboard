// [4.10] CSV for the export, RFC 4180 with one extra rule so a file can be read back exactly: an empty unquoted
// field is null, a quoted empty field ("") is an empty string. Booleans are true/false, JSON columns are JSON text,
// times stay as the database gave them (ISO 8601 with offset). Files start with a UTF-8 byte order mark so Excel
// shows emoji and accents; the reader skips it.

export type Cell = string | number | boolean | null | undefined | object;

const BOM = "﻿";

function field(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text === "" || /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return BOM + [header, ...rows].map((r) => r.map(field).join(",")).join("\r\n") + "\r\n";
}

/** Rows of fields; null where a field was empty and unquoted. The first row is the header. */
export function parseCsv(text: string): (string | null)[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let i = 0;
  const n = src.length;
  if (n === 0) return rows;
  while (i <= n) {
    let value: string | null;
    if (src[i] === '"') {
      let out = "";
      i++;
      for (;;) {
        if (i >= n) throw new Error("CSV: a quoted field is not closed");
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            out += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else out += src[i++];
      }
      value = out;
    } else {
      let end = i;
      while (end < n && src[end] !== "," && src[end] !== "\r" && src[end] !== "\n") end++;
      const raw = src.slice(i, end);
      value = raw === "" ? null : raw;
      i = end;
    }
    row.push(value);
    if (src[i] === ",") {
      i++;
      continue;
    }
    // End of the row: CRLF, LF, or the end of the text.
    rows.push(row);
    row = [];
    if (src[i] === "\r") i++;
    if (src[i] === "\n") i++;
    if (i >= n) break;
  }
  return rows;
}
