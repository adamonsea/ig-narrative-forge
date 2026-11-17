/**
 * Daily email "What's on" rules (pure, tested in dailyEvents.test.ts).
 *
 * Rows come from `get_topic_whats_on`, which already hides events that have
 * started (or untimed ones after 18:00) and keeps one row per event name.
 * The daily email then keeps only events happening today or tomorrow
 * (UK dates), soonest first, up to DAILY_EVENTS_PER_DAY for each day so a
 * busy today never pushes tomorrow out.
 */
export const DAILY_EVENTS_PER_DAY = 3;

export interface WhatsOnRow {
  id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM[:SS]
  location: string | null;
  source_url: string | null;
  source_name: string | null;
}

export interface DailyEmailEvent {
  id: string;
  title: string;
  date_label: string;
  time_label: string;
  location: string | null;
  url: string | null;
}

/** Today's date in the UK as YYYY-MM-DD. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function pickDailyEvents(rows: WhatsOnRow[], today: string, perDay = DAILY_EVENTS_PER_DAY): DailyEmailEvent[] {
  const tomorrow = addDays(today, 1);
  const byTime = (a: WhatsOnRow, b: WhatsOnRow) =>
    (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.title.localeCompare(b.title);
  const day = (d: string) => rows.filter((r) => r.start_date === d).sort(byTime).slice(0, perDay);
  return [...day(today), ...day(tomorrow)]
    .map((r) => ({
      id: r.id,
      title: r.title,
      date_label: r.start_date === today ? 'Today' : 'Tomorrow',
      time_label: r.start_time ? r.start_time.slice(0, 5) : 'All day',
      location: r.location || r.source_name || null,
      url: r.source_url || null,
    }));
}

/** Heading for the block: names only the days actually shown. */
export function dailyEventsHeading(events: DailyEmailEvent[]): string {
  const hasToday = events.some((e) => e.date_label === 'Today');
  const hasTomorrow = events.some((e) => e.date_label === 'Tomorrow');
  if (hasToday && hasTomorrow) return "What's on today & tomorrow";
  return hasToday ? "What's on today" : "What's on tomorrow";
}
