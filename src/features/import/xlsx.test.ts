import { crc32, unzip } from "@/features/export/zip";
import { columnName, readXlsx, writeXlsx } from "./xlsx";

/** A deflated ZIP, as Excel writes them, built by hand for the test (the app itself only writes stored ZIPs). */
async function deflatedZip(files: Record<string, string>): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = enc.encode(text);
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const stream = source.pipeThrough(new CompressionStream("deflate-raw"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    const n = enc.encode(name);
    const local = new Uint8Array(30 + n.length + packed.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0008, true); // sizes in a data descriptor: local header sizes left at 0, as streaming writers do
    l.setUint16(8, 8, true);
    l.setUint16(26, n.length, true);
    local.set(n, 30);
    local.set(packed, 30 + n.length);
    parts.push(local);
    const c = new Uint8Array(46 + n.length);
    const v = new DataView(c.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(10, 8, true);
    v.setUint32(16, crc32(data), true);
    v.setUint32(20, packed.length, true);
    v.setUint32(24, data.length, true);
    v.setUint16(28, n.length, true);
    v.setUint32(42, offset, true);
    c.set(n, 46);
    central.push(c);
    offset += local.length;
  }
  const size = central.reduce((t, c) => t + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

describe("columnName", () => {
  it("names columns like Excel", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
});

describe("writeXlsx / readXlsx", () => {
  it("reads back the first sheet it wrote, special characters included", async () => {
    const bytes = writeXlsx([
      {
        name: "Transactions",
        header: true,
        rows: [
          ["Date", "Payee"],
          ["2026-11-05", 'Tom & Jerry <Ltd> "café" 🍽️'],
        ],
      },
      { name: "Lists", rows: [["x"]] },
    ]);
    expect(await readXlsx(bytes)).toEqual([
      ["Date", "Payee"],
      ["2026-11-05", 'Tom & Jerry <Ltd> "café" 🍽️'],
    ]);
  });

  it("writes the parts Excel needs, with a frozen bold header and drop-down lists", () => {
    const files = unzip(
      writeXlsx([
        {
          name: "T",
          header: true,
          rows: [["A"]],
          widths: [12],
          lists: [{ cells: "A2:A9", from: "Lists!$A$2:$A$3" }],
        },
      ]),
    );
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    const sheet = new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml"));
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheet).toContain(
      '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="A2:A9"><formula1>Lists!$A$2:$A$3</formula1>',
    );
  });

  it("reads a deflated workbook with shared strings, numbers and gaps, as Excel saves it", async () => {
    const bytes = await deflatedZip({
      "xl/workbook.xml": `<workbook ${MAIN} ${R}><sheets><sheet name="Mine" sheetId="1" r:id="rId7"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="x" Target="worksheets/data.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst ${MAIN}><si><t>Date</t></si><si><t>Amount</t></si><si><r><t>M-</t></r><r><t>PESA</t></r></si></sst>`,
      "xl/worksheets/data.xml": `<worksheet ${MAIN}><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
        <row r="3"><c r="A3"><v>46331</v></c><c r="B3" t="s"><v>2</v></c><c r="C3"><v>-450.5</v></c><c r="D3" t="b"><v>1</v></c></row>
      </sheetData></worksheet>`,
    });
    expect(await readXlsx(bytes)).toEqual([
      ["Date", "", "Amount"],
      [],
      ["46331", "M-PESA", "-450.5", "TRUE"],
    ]);
  });

  it("says so when the file is not a workbook", async () => {
    await expect(readXlsx(new TextEncoder().encode("Date,Amount\n"))).rejects.toThrow("not a readable .xlsx");
  });
});
