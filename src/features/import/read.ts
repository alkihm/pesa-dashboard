import { parseCsv } from "@/features/export/csv";
import { readXlsx } from "./xlsx";

/** The rows of an uploaded file: a workbook (.xlsx, or anything that starts like a ZIP) or CSV text. */
export async function readTable(file: Blob & { name: string }): Promise<string[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return readXlsx(bytes);
  return parseCsv(new TextDecoder().decode(bytes)).map((r) => r.map((c) => c ?? ""));
}
