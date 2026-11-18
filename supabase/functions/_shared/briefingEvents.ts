/**
 * Events in briefings (pure; shared by the feed's Daily/Weekly briefing pages
 * and the weekly email; tested in briefingEvents.test.ts).
 *
 * News looks back, events look ahead. A briefing keeps its news for its own
 * day or week, and adds what's coming up from today:
 *   - Daily: today and tomorrow, while the briefing is today's or yesterday's.
 *   - Weekly: the next 7 days, while the briefing week is running or ended
 *     at most 7 days ago.
 * Older briefings show no events (their "coming up" has passed).
 *
 * Rows come from `get_topic_whats_on`, which already hides events that have
 * started and keeps one row per event name.
 */
export type BriefingKind = 'daily' | 'weekly';

/** Most events a briefing shows. */
export const BRIEFING_EVENTS_MAX = 8;

export interface BriefingEventRow {
  id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null;
}

export interface BriefingWindow {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Which dates of events a briefing shows, or null when it's too old.
 * `periodEnd` is the last day the briefing's news covers (the day itself for daily).
 */
export function briefingWindow(kind: BriefingKind, periodEnd: string, today: string): BriefingWindow | null {
  if (kind === 'daily') {
    if (periodEnd < addDaysYmd(today, -1)) return null;
    return { from: today, to: addDaysYmd(today, 1) };
  }
  if (periodEnd < addDaysYmd(today, -7)) return null;
  return { from: today, to: addDaysYmd(today, 6) };
}

/**
 * Events inside the window, soonest first, at most `max`. Each day gets a fair
 * share first (so a busy today never pushes tomorrow out), then spare places
 * go to the soonest remaining events.
 */
export function pickBriefingEvents<T extends BriefingEventRow>(
  rows: T[], window: BriefingWindow | null, max = BRIEFING_EVENTS_MAX,
): T[] {
  if (!window || max <= 0) return [];
  const byTime = (a: T, b: T) =>
    a.start_date.localeCompare(b.start_date) ||
    (a.start_time ?? '99').localeCompare(b.start_time ?? '99') ||
    a.title.localeCompare(b.title);
  const inside = rows.filter((r) => r.start_date >= window.from && r.start_date <= window.to).sort(byTime);
  const days = [...new Set(inside.map((r) => r.start_date))];
  if (days.length === 0) return [];
  const perDay = Math.max(1, Math.ceil(max / days.length));
  const first = days.flatMap((d) => inside.filter((r) => r.start_date === d).slice(0, perDay));
  const picked = new Set(first.slice(0, max).map((r) => r.id));
  for (const r of inside) {
    if (picked.size >= max) break;
    picked.add(r.id);
  }
  return inside.filter((r) => picked.has(r.id));
}

/** Label for the events part of a briefing. */
export function briefingEventsLabel(kind: BriefingKind, events: BriefingEventRow[], today: string): string {
  if (kind === 'weekly') return 'The week ahead';
  const hasToday = events.some((e) => e.start_date === today);
  const hasTomorrow = events.some((e) => e.start_date !== today);
  if (hasToday && hasTomorrow) return 'Today & tomorrow';
  return hasToday ? 'Today' : 'Tomorrow';
}
