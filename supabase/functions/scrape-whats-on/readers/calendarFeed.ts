/**
 * calendar_feed — Chamber-style JSON events feed (a list of
 * { eventID, start, title, time?, details?, display_name?, allDay? }).
 * Same rules as ingest-chamber-events, so both write identical rows while the
 * legacy topics.event_source_url importer is still running.
 */
import type { EventReader, ReaderEvent, ReaderResult } from './types.ts';

export const CALENDAR_SOURCE_API = 'chamber_feed';
export const CALENDAR_DAYS_AHEAD = 120;
const USER_AGENT = 'Mozilla/5.0 (compatible; CuratrEvents/1.0)';
const TIMEOUT_MS = 20000;

interface ChamberEvent {
  eventID: string | number;
  display_name?: string;
  start: string;
  time?: string;
  title: string;
  details?: string;
  allDay?: boolean;
}

// ---------- pure rules (tested) ----------

/** True when the start of a response body is a Chamber-style events list. */
export function looksLikeCalendarFeed(head: string): boolean {
  const s = head.replace(/^\uFEFF/, '').trimStart();
  if (!/^\[\s*\{/.test(s)) return false;
  // The first object can be cut off (we only read the start), so look for its keys in the head
  const start = s.slice(0, 4000);
  return /"eventID"\s*:/.test(start) && /"start"\s*:/.test(start) && /"title"\s*:/.test(start);
}

export function toPlainText(html: string | undefined, maxLength = 400): string | null {
  if (!html) return null;
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Chamber titles arrive as "\nEvent from our member\n<Member>\n<Real title>" — keep the last line. */
export function cleanTitle(raw: string): string {
  const lines = (raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (lines[lines.length - 1] || raw || 'Untitled event').slice(0, 300);
}

/** "Wednesday 21st May 2025 @ 09:00 - 16:00" -> "16:00:00" */
export function extractEndTime(timeLabel: string | undefined): string | null {
  if (!timeLabel) return null;
  const match = timeLabel.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  const [h, m] = match[2].split(':');
  return `${h.padStart(2, '0')}:${m}:00`;
}

/** Public page for an event: members.example.co.uk feed -> www.example.co.uk/events?id=… */
export function eventPageBase(feedUrl: string): string {
  return `${new URL(feedUrl).origin.replace('members.', 'www.')}/events`;
}

/** Upcoming events (today .. today+daysAhead, UTC) from a parsed feed. */
export function calendarEvents(parsed: unknown, feedUrl: string, now = new Date(), daysAhead = CALENDAR_DAYS_AHEAD): ReaderEvent[] {
  if (!Array.isArray(parsed)) return [];
  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + daysAhead);
  const base = eventPageBase(feedUrl);
  return (parsed as ChamberEvent[])
    .filter((e) => e?.start && e?.eventID !== undefined && e?.eventID !== null)
    .map((e) => ({ e, when: new Date(e.start) }))
    .filter(({ when }) => !isNaN(when.getTime()) && when >= windowStart && when <= windowEnd)
    .map(({ e }) => ({
      key: String(e.eventID),
      title: cleanTitle(e.title),
      description: toPlainText(e.details),
      start_date: e.start.slice(0, 10),
      start_time: e.allDay ? null : e.start.slice(11, 19) || null,
      end_time: e.allDay ? null : extractEndTime(e.time),
      venue: null,
      category: 'Business & Community',
      url: `${base}?id=${e.eventID}`,
      source_name: e.display_name || 'Chamber of Commerce',
    }));
}

// ---------- network ----------

function headers(url: string): Record<string, string> {
  return {
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': eventPageBase(url),
    'User-Agent': USER_AGENT,
  };
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fn(controller.signal); } finally { clearTimeout(timer); }
}

export const calendarFeedReader: EventReader = {
  kind: 'calendar_feed',
  sourceApi: CALENDAR_SOURCE_API,
  externalId: (_sourceId, key) => key, // same ids as the legacy importer, so rows never double up

  async detect(url) {
    try {
      return await withTimeout(async (signal) => {
        const res = await fetch(url, { headers: headers(url), redirect: 'follow', signal });
        if (!res.ok || !res.body) return false;
        // Only read the first few KB — feeds can be several MB
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let head = '';
        while (head.length < 4000) {
          const { value, done } = await reader.read();
          if (done) break;
          head += decoder.decode(value, { stream: true });
        }
        reader.cancel().catch(() => {});
        return looksLikeCalendarFeed(head);
      });
    } catch {
      return false;
    }
  },

  async read(url): Promise<ReaderResult> {
    const name = (() => { try { return `Calendar feed (${new URL(url).hostname.replace(/^(www|members)\./, '')})`; } catch { return 'Calendar feed'; } })();
    try {
      const raw = await withTimeout(async (signal) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { ...headers(url), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'start=&end=',
          signal,
        });
        if (!res.ok) throw new Error(`The feed returned an error (${res.status}).`);
        return await res.text();
      });
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return { events: [], method: null, name, error: 'The feed did not return a list of events.' }; }
      if (!Array.isArray(parsed)) return { events: [], method: null, name, error: 'The feed did not return a list of events.' };
      return { events: calendarEvents(parsed, url), method: 'calendar_feed', name, error: null };
    } catch (e) {
      const msg = e instanceof Error && e.name !== 'AbortError' ? e.message : 'The feed didn’t respond.';
      return { events: [], method: null, name, error: msg };
    }
  },
};
