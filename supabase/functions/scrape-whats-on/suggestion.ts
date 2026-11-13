/**
 * Reader-suggested events: pure rules (no I/O), covered by suggestion.test.ts.
 * A suggestion is only ever 'pending' (Waiting) or 'excluded' (Hidden, out of area);
 * it never goes live without the feed's owner, whatever Auto-publish says.
 */
import { addDays } from './extract.ts';
import { isOutOfArea } from './relevance.ts';
import type { Verdict } from './locality.ts';

export const SUGGEST_DAYS_AHEAD = 92;      // about three months
export const SUGGEST_PER_READER_PER_DAY = 3;
export const SUGGEST_PER_FEED_PER_DAY = 40;

/** Date must be today .. ~3 months ahead (UK date). */
export function suggestionDateOk(date: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= addDays(today, SUGGEST_DAYS_AHEAD);
}

/** Only an http(s) link to a real-looking host counts as "a link to the full listing". */
export function listingUrlOk(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') && !/^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname);
  } catch { return false; }
}

/** Waiting, or Hidden when clearly out of area. Never published. */
export function suggestionStatus(verdict: Verdict): { status: 'pending' | 'excluded'; reason: string | null } {
  return isOutOfArea(verdict) ? { status: 'excluded', reason: (verdict as { reason: string }).reason } : { status: 'pending', reason: null };
}
