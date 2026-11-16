import { londonToday } from "./whatsOn";

/** Published-story counts for the Story pool's "Published" glance. */
export interface PublishedCounts { today: number; week: number; month: number }

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/**
 * Counts stories by the London day they went live, using the same rolling windows as the
 * Event pool: today, the last 7 days (incl. today) and the last 30 days (incl. today).
 * Missing or future times are ignored.
 */
export function publishedCounts(publishedAt: Array<string | null | undefined>, now: Date = new Date()): PublishedCounts {
  const today = dayNumber(londonToday(now));
  const counts: PublishedCounts = { today: 0, week: 0, month: 0 };
  for (const ts of publishedAt) {
    if (!ts) continue;
    const when = new Date(ts);
    if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime()) continue;
    const ago = today - dayNumber(londonToday(when));
    if (ago < 0 || ago > 29) continue;
    counts.month++;
    if (ago <= 6) counts.week++;
    if (ago === 0) counts.today++;
  }
  return counts;
}
