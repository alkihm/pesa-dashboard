import type { DonutSlice } from "./Donut";

/** Largest first; anything past `max - 1` slices becomes one "Other" slice in the neutral colour. */
export function foldSlices(slices: DonutSlice[], max: number): DonutSlice[] {
  const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const kept = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((sum, s) => sum + s.value, 0);
  return [...kept, { key: "other", label: "Other", value: rest, colour: "cat-12", emoji: "📦" }];
}

/** A round top for the axis: each of the four steps is 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10ⁿ. */
export function niceMax(max: number, steps = 4) {
  if (max <= 0) return steps;
  const raw = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  return step * steps;
}
