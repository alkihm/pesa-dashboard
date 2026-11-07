// Pull-to-refresh numbers ([4.6]).

/** How far to pull (after resistance) before letting go refreshes. */
export const PULL_TRIGGER = 70;
const MAX_PULL = 110;
export const SHOWN_MS = 900;

/** Finger travel → how far the indicator moves: it follows at half speed and stops at MAX_PULL. */
export function pullDistance(dy: number) {
  return Math.max(0, Math.min(MAX_PULL, dy / 2));
}
