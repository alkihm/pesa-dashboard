// Category colour keys stored in `categories.colour` (D-009 rule 12). Values live in src/styles/tokens.css.
export const CATEGORY_COLOURS = [
  { key: "cat-1", name: "Mint" },
  { key: "cat-2", name: "Blue" },
  { key: "cat-3", name: "Amber" },
  { key: "cat-4", name: "Sky" },
  { key: "cat-5", name: "Coral" },
  { key: "cat-6", name: "Violet" },
  { key: "cat-7", name: "Teal" },
  { key: "cat-8", name: "Orange" },
  { key: "cat-9", name: "Gold" },
  { key: "cat-10", name: "Rose" },
  { key: "cat-11", name: "Lime" },
  { key: "cat-12", name: "Slate" },
] as const;

export type CategoryColour = (typeof CATEGORY_COLOURS)[number]["key"];

export function isCategoryColour(value: string): value is CategoryColour {
  return CATEGORY_COLOURS.some((colour) => colour.key === value);
}

/** CSS colour for a stored key; unknown keys fall back to slate. */
export function categoryColourVar(key: string, variant: "solid" | "tint" = "solid") {
  const safe = isCategoryColour(key) ? key : "cat-12";
  return variant === "tint" ? `var(--${safe}-tint)` : `var(--${safe})`;
}
