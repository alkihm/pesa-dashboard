import tokens from "@/styles/tokens.css?raw";
import { CATEGORY_COLOURS, categoryColourVar, isCategoryColour } from "./categoryColours";

describe("category colours", () => {
  it("has twelve keys, each defined in the tokens with a tint", () => {
    expect(CATEGORY_COLOURS).toHaveLength(12);
    for (const { key } of CATEGORY_COLOURS) {
      expect(tokens).toContain(`--${key}:`);
      expect(tokens).toContain(`--${key}-tint:`);
    }
  });

  it("recognises stored keys", () => {
    expect(isCategoryColour("cat-7")).toBe(true);
    expect(isCategoryColour("cat-13")).toBe(false);
  });

  it("maps a key to its CSS variable and falls back to slate", () => {
    expect(categoryColourVar("cat-3")).toBe("var(--cat-3)");
    expect(categoryColourVar("cat-3", "tint")).toBe("var(--cat-3-tint)");
    expect(categoryColourVar("purple")).toBe("var(--cat-12)");
  });
});
