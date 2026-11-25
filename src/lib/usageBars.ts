/** Pure helpers for Settings → Usage (kept separate so they are testable). */
export interface UsageFigures { used: number; limit: number }

/** Percent used, clamped 0–100; a zero limit reads as full. */
export function usagePercent({ used, limit }: UsageFigures): number {
  if (limit <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

/** Highest alert threshold reached (75/90/100), or null. */
export function usageThreshold(f: UsageFigures): 75 | 90 | 100 | null {
  const p = f.limit <= 0 ? 100 : (f.used / f.limit) * 100;
  if (p >= 100) return 100;
  if (p >= 90) return 90;
  if (p >= 75) return 75;
  return null;
}

/** Desk button: free owners upgrade, Pro owners top up. */
export const pausedAction = (isPro: boolean) => (isPro ? "Top up" : "Upgrade");
