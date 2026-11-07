import { crc32, unzip, zip } from "./zip";

const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b);

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("reads back the files it wrote, names in UTF-8", () => {
    const bytes = zip([
      { name: "README.txt", data: "hello" },
      { name: "café 🗃️.csv", data: "a,b\r\n1,2\r\n" },
      { name: "empty.csv", data: "" },
    ]);
    const files = unzip(bytes);
    expect([...files.keys()]).toEqual(["README.txt", "café 🗃️.csv", "empty.csv"]);
    expect(text(files.get("café 🗃️.csv"))).toBe("a,b\r\n1,2\r\n");
    expect(text(files.get("empty.csv"))).toBe("");
  });

  it("starts with a local file header and ends with the end-of-directory record", () => {
    const bytes = zip([{ name: "a.txt", data: "x" }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });

  it("notices a damaged file", () => {
    const bytes = zip([{ name: "a.txt", data: "hello" }]);
    bytes[30 + "a.txt".length] = "j".charCodeAt(0);
    expect(() => unzip(bytes)).toThrow("damaged");
  });

  it("refuses something that is not a ZIP", () => {
    expect(() => unzip(new TextEncoder().encode("not a zip at all, just text"))).toThrow("Not a ZIP");
  });
});
