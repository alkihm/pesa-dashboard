// [4.7] Just enough of the .xlsx format for the import template, with no dependency: write a workbook of text
// sheets (bold, frozen header, column widths, drop-down lists), and read the first sheet of any workbook back as
// rows of text. Dates and times typed into Excel come back as serial numbers; rows.ts turns those into dates.

import { unzipAsync, zip } from "@/features/export/zip";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

export interface Sheet {
  name: string;
  rows: string[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Bold, frozen first row. */
  header?: boolean;
  /** Drop-down lists: cells (e.g. "C2:C1000") and the range they offer (e.g. "Lists!$A$2:$A$9"). */
  lists?: { cells: string; from: string }[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) =>
          value === ""
            ? ""
            : `<c r="${columnName(c)}${r + 1}" t="inlineStr"${sheet.header && r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(value)}</t></is></c>`,
        )
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const views = sheet.header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : "";
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const lists = sheet.lists?.length
    ? `<dataValidations count="${sheet.lists.length}">${sheet.lists
        .map(
          (l) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${l.cells}"><formula1>${esc(l.from)}</formula1></dataValidation>`,
        )
        .join("")}</dataValidations>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN}">${views}${cols}<sheetData>${rows}</sheetData>${lists}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

export function writeXlsx(sheets: readonly Sheet[], at = new Date()): Uint8Array {
  const n = sheets.length;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join(
      "",
    )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;

  return zip(
    [
      { name: "[Content_Types].xml", data: types },
      { name: "_rels/.rels", data: rels },
      { name: "xl/workbook.xml", data: workbook },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
      { name: "xl/styles.xml", data: STYLES },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ],
    at,
  );
}

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const all = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*", tag));

/** "C12" → column index 2. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/** The first sheet of a workbook as rows of text. Empty rows are kept as empty arrays so row numbers match Excel's. */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  let files: Map<string, Uint8Array>;
  try {
    files = await unzipAsync(bytes);
  } catch {
    throw new Error("This file is not a readable .xlsx workbook");
  }
  const dec = new TextDecoder();
  const text = (name: string) => {
    const f = files.get(name);
    return f ? dec.decode(f) : undefined;
  };

  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("This file is not a readable .xlsx workbook");
  const first = all(xml(workbook), "sheet")[0];
  const rid = first?.getAttributeNS(REL, "id") ?? first?.getAttribute("r:id");
  const target = rid
    ? all(xml(text("xl/_rels/workbook.xml.rels") ?? "<r/>"), "Relationship")
        .find((r) => r.getAttribute("Id") === rid)
        ?.getAttribute("Target")
    : undefined;
  const path = target
    ? target.startsWith("/")
      ? target.slice(1)
      : `xl/${target}`
    : "xl/worksheets/sheet1.xml";
  const sheet = text(path);
  if (!sheet) throw new Error("The workbook has no sheet to read");

  const shared = all(xml(text("xl/sharedStrings.xml") ?? "<sst/>"), "si").map((si) =>
    all(si, "t")
      .map((t) => t.textContent ?? "")
      .join(""),
  );

  const rows: string[][] = [];
  for (const row of all(xml(sheet), "row")) {
    const r = Number(row.getAttribute("r") ?? rows.length + 1) - 1;
    const cells: string[] = [];
    for (const c of all(row, "c")) {
      const i = columnIndex(c.getAttribute("r") ?? columnName(cells.length));
      const type = c.getAttribute("t");
      const v = all(c, "v")[0]?.textContent ?? "";
      const value =
        type === "s"
          ? (shared[Number(v)] ?? "")
          : type === "inlineStr"
            ? all(c, "t")
                .map((t) => t.textContent ?? "")
                .join("")
            : type === "b"
              ? v === "1"
                ? "TRUE"
                : "FALSE"
              : v;
      cells[i] = value;
    }
    rows[r] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(rows, (x) => x ?? []);
}
