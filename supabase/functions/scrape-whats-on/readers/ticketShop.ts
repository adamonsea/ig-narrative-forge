/**
 * ticket_shop — an organiser's own ticket shop on a white-label platform
 * (grovetheatre.onlineticketseller.com). The shop page carries its listings as
 * structured data (start date/time, venue and address, link, picture), so dates
 * are read, never guessed. The shop sits behind a bot check, so when a plain read
 * gets the check instead of the page, Firecrawl reads it.
 */
import type { EventReader, ReaderEvent, ReaderResult } from './types.ts';
import { ticketShopOrigin } from '../platforms.ts';
import { addDays, londonToday } from '../extract.ts';
import { allowedByRobots, DAYS_AHEAD } from '../read.ts';
import { toPlainText } from './calendarFeed.ts';
import { firecrawlRawHtml } from '../firecrawl.ts';

const USER_AGENT = 'Mozilla/5.0 (compatible; CuratrEvents/1.0; +https://curatr.pro)';
const MAX_PAGES = 3;

// ---------- pure rules (tested) ----------

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", '#039': "'", '#39': "'" };

export function decodeAttr(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return m;
  });
}

/** The shop's page data (the JSON in data-page="…"), or null when the page isn't a shop page. */
export function shopPageData(html: string): Record<string, unknown> | null {
  const m = html.match(/\sdata-page="([^"]+)"/);
  if (!m) return null;
  try {
    const j = JSON.parse(decodeAttr(m[1]));
    return j && typeof j === 'object' ? j as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

interface ShopEvent {
  id?: number | string; name?: string; start_datetime?: string; end_datetime?: string;
  status_slug?: string; is_cancelled?: boolean; is_past?: boolean; deleted?: boolean; url?: string;
  description?: string; type?: string;
  venue?: { name?: string; address_full?: string; city?: { name?: string } } | null;
  settings?: { is_online_only?: boolean; is_hidden?: number | boolean } | null;
  images?: Record<string, { url?: string } | null> | null;
  tags?: ({ name?: string | Record<string, string> } | string)[] | null;
}

interface Paged { data: ShopEvent[]; links?: { url: string | null; label: unknown }[] }

/** Every paginated list of events in the page data (listing blocks, or the browse page). */
function eventLists(o: unknown, depth = 0, out: Paged[] = []): Paged[] {
  if (!o || typeof o !== 'object' || depth > 6) return out;
  if (Array.isArray(o)) { o.slice(0, 50).forEach((x) => eventLists(x, depth + 1, out)); return out; }
  const r = o as Record<string, unknown>;
  const data = r.data;
  if (Array.isArray(data) && data.length && data.every((d) => d && typeof d === 'object' && 'start_datetime' in d && 'name' in d)) {
    out.push(r as unknown as Paged);
    return out;
  }
  for (const [k, v] of Object.entries(r)) {
    if (k === 'lang_lines' || k === 'all_countries' || k === 'company') continue;
    eventLists(v, depth + 1, out);
  }
  return out;
}

/** "https://x/events/123?sid=…" → "https://x/events/123" (the sid is a per-visit token). */
export function stripSid(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.searchParams.delete('sid');
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function tagNames(tags: ShopEvent['tags']): string | null {
  const names = (tags ?? []).map((t) => typeof t === 'string' ? t : typeof t?.name === 'string' ? t.name : t?.name ? Object.values(t.name)[0] : '')
    .filter((n): n is string => Boolean(n));
  return names.length ? names.join(', ') : null;
}

/** Events from one shop page: upcoming only (today .. today+daysAhead), published, not cancelled or hidden. */
export function shopEvents(data: Record<string, unknown>, origin: string, today: string, daysAhead = DAYS_AHEAD): ReaderEvent[] {
  const end = addDays(today, daysAhead);
  const out: ReaderEvent[] = [];
  const seen = new Set<string>();
  for (const list of eventLists((data as { props?: unknown }).props)) {
    for (const e of list.data) {
      const m = (e.start_datetime || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
      if (!m || e.id == null || !e.name) continue;
      const [, date, hm] = m;
      if (date < today || date > end) continue;
      if (e.is_cancelled || e.is_past || e.deleted || (e.status_slug && e.status_slug !== 'published')) continue;
      if (e.settings?.is_hidden) continue;
      const key = String(e.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const endM = (e.end_datetime || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
      const place = [e.venue?.address_full, e.venue?.city?.name].filter(Boolean).join(', ') || null;
      out.push({
        key,
        title: e.name.trim().slice(0, 300),
        start_date: date,
        start_time: hm === '00:00' ? null : `${hm}:00`,
        end_time: endM && endM[1] === date && endM[2] !== hm ? `${endM[2]}:00` : null,
        venue: e.venue?.name?.trim() || null,
        url: stripSid(e.url) ?? `${origin}/events/${key}`,
        description: toPlainText(e.description),
        place,
        online: Boolean(e.settings?.is_online_only),
        price: null,
        is_free: null,
        hint: tagNames(e.tags),
        tags: tagNames(e.tags)?.split(', ') ?? [],
        end_date: endM && endM[1] > date ? endM[1] : null,
        image: stripSid(Object.values(e.images ?? {}).find((i) => i?.url)?.url ?? null),
      });
    }
  }
  return out.sort((a, b) => (a.start_date + (a.start_time ?? '')).localeCompare(b.start_date + (b.start_time ?? '')));
}

/** True when the page has an events list at all (even an empty one), so /browse needn't be tried. */
export function hasEventLists(data: Record<string, unknown>): boolean {
  const props = (data as { props?: { blocks?: { block?: { matching_events?: unknown } }[]; events?: unknown } }).props;
  return Boolean(props?.events) || (props?.blocks ?? []).some((b) => b?.block?.matching_events);
}

/** The next page of the same shop's listings, if the page has one. */
export function nextShopPage(data: Record<string, unknown>, origin: string): string | null {
  for (const list of eventLists((data as { props?: unknown }).props)) {
    const next = (list.links ?? []).find((l) => l?.label === 'Next' || l?.label === 'Next &raquo;')?.url;
    if (next) {
      try { if (new URL(next).origin === origin) return stripSid(next); } catch { /* skip */ }
    }
  }
  return null;
}

export function shopName(data: Record<string, unknown>, origin: string): string {
  const c = (data as { props?: { company?: { name?: unknown } } }).props?.company?.name;
  return typeof c === 'string' && c.trim() ? c.trim().slice(0, 120) : new URL(origin).hostname.split('.')[0];
}

// ---------- network ----------

async function fetchShopPage(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    if (res.ok) {
      const data = shopPageData(html);
      if (data) return data;
    }
  } catch { /* fall through to Firecrawl */ }
  const html = await firecrawlRawHtml(url);
  return html ? shopPageData(html) : null;
}

export const ticketShopReader: EventReader = {
  kind: 'ticket_shop',
  sourceApi: 'ticket_shop',
  externalId: (sourceId, key) => `${sourceId}:${key}`,
  detect: (url) => Promise.resolve(ticketShopOrigin(url) !== null),

  async read(url): Promise<ReaderResult> {
    const origin = ticketShopOrigin(url);
    if (!origin) return { events: [], method: null, name: url, error: 'That isn’t an organiser’s ticket shop.' };
    const fallbackName = new URL(origin).hostname.split('.')[0];
    if (!(await allowedByRobots(`${origin}/`))) {
      return { events: [], method: null, name: fallbackName, error: 'This site asks automated readers not to visit that page, so we won’t read it.' };
    }
    const today = londonToday();
    let name = fallbackName;
    let reached = false;
    let listed = false;
    // The shop's home page lists its events; some shops only list them on /browse
    for (const start of [`${origin}/`, `${origin}/browse`]) {
      if (listed) break; // the home page had its list, just nothing upcoming
      const events: ReaderEvent[] = [];
      let next: string | null = start;
      for (let page = 0; next && page < MAX_PAGES; page++) {
        const data = await fetchShopPage(next);
        if (!data) break;
        reached = true;
        if (page === 0) { name = shopName(data, origin); listed = start.endsWith('/') && hasEventLists(data); }
        for (const e of shopEvents(data, origin, today)) if (!events.some((x) => x.key === e.key)) events.push(e);
        next = nextShopPage(data, origin);
      }
      if (events.length) return { events, method: 'ticket_shop', name, error: null };
    }
    return { events: [], method: null, name, error: reached ? null : 'The shop didn’t let us read its listings.' };
  },
};
