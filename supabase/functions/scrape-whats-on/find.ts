/**
 * Finding what's-on sources for a feed that doesn't exist yet (create-a-feed flow).
 * Pure rules here (queries, candidate filtering, ranking); the handler does the reads.
 * Only addresses whose reader actually found upcoming events are ever returned.
 */
import { ticketShopOrigin } from './platforms.ts';

export const FIND_BLOCKED_HOSTS = [
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'pinterest.com',
  'linkedin.com', 'youtube.com', 'medium.com', 'tripadvisor.', 'wikipedia.org', 'yelp.', 'booking.com',
];
export const FIND_MAX_CANDIDATES = 6;
export const FIND_MAX_RESULTS = 5;
export const FIND_TICKED = 3;

export function findQueries(term: string, regional: boolean): string[] {
  const t = term.trim();
  if (!t) return [];
  return regional
    ? [`${t} what's on events`, `${t} events calendar this month`]
    : [`${t} events calendar`, `${t} upcoming events listings`];
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/** One address per site (ticket shops by their home), social/review sites left out, search order kept. */
export function findCandidates(links: string[], max = FIND_MAX_CANDIDATES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of links) {
    const host = hostOf(raw);
    if (!host || FIND_BLOCKED_HOSTS.some((b) => host.includes(b))) continue;
    const url = ticketShopOrigin(raw) ?? raw;
    const key = hostOf(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

export interface FoundSource { url: string; name: string; kind: string; count: number; samples: { title: string; date: string }[]; confidence_score: number }

/** Confidence from how many upcoming events were read: 1 → 60, 10+ → 95. */
export const findConfidence = (count: number) => Math.min(95, 55 + Math.min(count, 10) * 4);

/** Keep sources with events, confidence ≥ 60, most events first. */
export function rankFound(found: FoundSource[], max = FIND_MAX_RESULTS): FoundSource[] {
  return found.filter((f) => f.count > 0 && f.confidence_score >= 60).sort((a, b) => b.count - a.count).slice(0, max);
}
