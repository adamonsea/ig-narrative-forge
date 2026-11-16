/**
 * Pure rules for the dashboard reader figures (no AI, covered by readerStats.test.ts).
 */

/** Friendly names for common referring sites; anything else shows its own address. */
export function sourceName(host: string): string {
  const h = host.toLowerCase().replace(/^(www\.|m\.|l\.|lm\.)/, '');
  if (/(^|\.)google\./.test(h) || h === 'news.google.com') return 'Google';
  if (h === 'android.gm' || h === 'com.google.android.gm' || h === 'mail.google.com') return 'Gmail';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h)) return 'Facebook';
  if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram';
  if (h === 't.co' || /(^|\.)(x\.com|twitter\.com)$/.test(h)) return 'X';
  if (/(^|\.)linkedin\.com$/.test(h) || h === 'lnkd.in') return 'LinkedIn';
  if (/(^|\.)bing\.com$/.test(h)) return 'Bing';
  if (/(^|\.)duckduckgo\.com$/.test(h)) return 'DuckDuckGo';
  if (/(^|\.)reddit\.com$/.test(h)) return 'Reddit';
  return h;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Daily self-check. Arrays are the last 14 days, oldest first, today last.
 * Compares the last 3 complete days with the 7 days before them: visits at least doubled
 * (and up by 5+ a day) while readers stayed within 25% (+1) of before → likely automated traffic.
 */
export function likelyAutomatedRise(visitsDaily: number[] | null | undefined, readersDaily: number[] | null | undefined): boolean {
  const v = (visitsDaily ?? []).map((x) => Number(x) || 0);
  const r = (readersDaily ?? []).map((x) => Number(x) || 0);
  if (v.length < 11 || r.length < 11) return false;
  const end = v.length - 1; // exclude today (partial)
  const vRecent = avg(v.slice(end - 3, end)), vPrior = avg(v.slice(end - 10, end - 3));
  const rRecent = avg(r.slice(end - 3, end)), rPrior = avg(r.slice(end - 10, end - 3));
  const visitsJumped = vRecent >= vPrior * 2 && vRecent - vPrior >= 5;
  const readersFlat = rRecent <= rPrior * 1.25 + 1;
  return visitsJumped && readersFlat;
}

/** Feed-level stopped/swiped rates show once this many outside readers saw headlines this week. */
export const FEED_SIGNAL_MIN_READERS = 3;
export const FEED_SIGNAL_MIN_HEADLINES = 20;

export interface FeedSignal { readers?: number | null; headlines?: number | null; stop_rate?: number | null; swipe_rate?: number | null }

export function feedSignal(s: FeedSignal | null | undefined): { stopped: number; swiped: number; readers: number } | null {
  if (!s) return null;
  const readers = Number(s.readers) || 0, headlines = Number(s.headlines) || 0;
  if (readers < FEED_SIGNAL_MIN_READERS || headlines < FEED_SIGNAL_MIN_HEADLINES) return null;
  if (s.stop_rate == null || s.swipe_rate == null) return null;
  return { stopped: Math.round(Number(s.stop_rate) * 100), swiped: Math.round(Number(s.swipe_rate) * 100), readers };
}
