// [4.9] Settings rules kept apart from the components: the PIN boxes and the review interval wording.

import { PIN_LENGTH } from "@/features/auth/pin";
import { redAfter } from "@/lib/review";

export const INTERVALS = [2, 3, 5, 7] as const;

/** The line under the interval: when the review status turns amber and red ([4.3] rules). */
export function intervalNote(days: number) {
  return `Status turns amber after ${days} days and red after ${redAfter(days)} days, or right away if a balance is off.`;
}

export type Problem = { field?: "current" | "next" | "repeat"; text: string };

const digits = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** What is wrong with the three boxes, before anything is sent. */
export function pinProblem(current: string, next: string, repeat: string): Problem | null {
  if (!digits.test(current)) return { field: "current", text: `Enter your current ${PIN_LENGTH}-digit PIN.` };
  if (!digits.test(next)) return { field: "next", text: `A PIN is ${PIN_LENGTH} digits.` };
  if (next === current) return { field: "next", text: "Choose a PIN different from the current one." };
  if (repeat !== next) return { field: "repeat", text: "The two new PINs differ." };
  return null;
}
