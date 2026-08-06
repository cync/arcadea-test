// AD-7: the single Aging computation — the board render and the scheduled
// Stale Alert job (Story 3.3) both call this exact function; neither
// recomputes Aging independently.

export const STALE_THRESHOLD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Aging {
  days: number;
  isStale: boolean;
}

export function computeAging(statusChangedAt: Date, now: Date = new Date()): Aging {
  const days = Math.floor((now.getTime() - statusChangedAt.getTime()) / DAY_MS);
  return { days, isStale: days > STALE_THRESHOLD_DAYS };
}
