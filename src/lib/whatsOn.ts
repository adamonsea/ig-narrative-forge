/**
 * Small, testable rules for events: sources, the Desk (Waiting / Hidden / Live)
 * and the feed's "What's on" card set.
 */

// ---------- sources ----------

/** A saved events source is flagged once two checks in a row found no events. */
export const BROKEN_AFTER_EMPTY_CHECKS = 2;

export const isBrokenWhatsOnSource = (consecutiveEmptyChecks: number | null | undefined): boolean =>
  (consecutiveEmptyChecks ?? 0) >= BROKEN_AFTER_EMPTY_CHECKS;

const shortDate = (ymd: string): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

/** "Found 8 upcoming events, e.g. 'The Nutcracker' on 4 Dec" */
export function previewSentence(found: number, example?: { title: string; start_date: string } | null): string {
  if (found <= 0) return "No upcoming events found on this page.";
  const noun = found === 1 ? "upcoming event" : "upcoming events";
  if (!example) return `Found ${found} ${noun}`;
  return `Found ${found} ${noun}, e.g. ‘${example.title}’ on ${shortDate(example.start_date)}`;
}

/** Readership line; hidden at zero. */
export function venueClicksLine(clicks: number | null | undefined): string | null {
  const n = Number(clicks) || 0;
  if (n <= 0) return null;
  return `Sent ${n.toLocaleString("en-GB")} ${n === 1 ? "click" : "clicks"} to local venues this week`;
}

/** Kinds of events source (event_sources.kind). New kinds only need a label here and a reader on the server. */
export type EventSourceKind = "whats_on_page" | "calendar_feed";

const KIND_LABELS: Record<EventSourceKind, string> = {
  whats_on_page: "What's-on page",
  calendar_feed: "Calendar feed",
};

export const eventSourceKindLabel = (kind: string | null | undefined): string =>
  KIND_LABELS[(kind as EventSourceKind)] ?? "Events source";

export type SourceKind = "rss" | "website" | EventSourceKind;

const LISTINGS_HOSTS = /(^|\.)(eventbrite\.|ticketsource\.|skiddle\.com|ents24\.com|wegottickets\.com|seetickets\.|allevents\.in|designmynight\.com|billetto\.|fatsoma\.com|dice\.fm|meetup\.com)/;

/** What kind of source a pasted link is, so the owner never has to choose. */
export function detectSourceKind(raw: string): SourceKind {
  const url = raw.trim().toLowerCase();
  if (/^webcal:|\.ics(\?|#|$)|[?&]format=(ical|ics)|\/ical\b|\/ajax|ajax_retrieveevents/.test(url)) return "calendar_feed";
  if (/\/(feed|rss|atom)(\/|\?|#|$)|\.(xml|rss|atom)(\?|#|$)|[?&]feed=rss/.test(url)) return "rss";
  let host = "";
  try { host = new URL(/^\w+:\/\//.test(url) ? url : `https://${url}`).hostname; } catch { /* not a link yet */ }
  if (host && LISTINGS_HOSTS.test(host)) return "whats_on_page";
  if (/(whats-?on|what-s-on|\/events?(\/|\?|#|$)|\/listings|\/gigs|\/calendar|\/diary)/.test(url)) return "whats_on_page";
  return "website";
}

export const isEventsSourceKind = (kind: SourceKind): kind is EventSourceKind =>
  kind === "whats_on_page" || kind === "calendar_feed";

/**
 * Events switch (collect + weekly email) and "Show in the feed" (only meaningful while
 * Events is on) together decide whether readers see the What's on card set.
 */
export const showEventsInFeed = (eventsEnabled: boolean | null | undefined, showInFeed: boolean | null | undefined): boolean =>
  Boolean(eventsEnabled) && Boolean(showInFeed);

// ---------- dates ----------

export interface WhatsOnFeedEvent {
  id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  location: string | null;
  source_url: string | null;
  source_name: string | null;
}

const DAY = 86_400_000;
const ymdToUtc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
  ymdToUtc(ymd).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
const daysBetween = (from: string, to: string) => Math.round((ymdToUtc(to).getTime() - ymdToUtc(from).getTime()) / DAY);
const addDays = (ymd: string, n: number) => new Date(ymdToUtc(ymd).getTime() + n * DAY).toISOString().slice(0, 10);

/** Today's date in London as YYYY-MM-DD (events are dated in UK local time). */
export function londonToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** Date badge parts: THU / 12 / NOV */
export function dateBadge(ymd: string): { weekday: string; day: string; month: string } {
  return {
    weekday: fmt(ymd, { weekday: "short" }).toUpperCase(),
    day: String(Number(ymd.slice(8, 10))),
    month: fmt(ymd, { month: "short" }).toUpperCase(),
  };
}

/** "Thu 12 Nov" */
export const dayLabel = (ymd: string): string => fmt(ymd, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

/** "10:30am", "7pm"; null when no time was given. */
export function eventTime(hms: string | null | undefined): string | null {
  if (!hms) return null;
  const [h, m] = hms.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

const evening = (hms: string | null) => Boolean(hms) && Number(hms!.slice(0, 2)) >= 17;

// ---------- the feed's What's on card set ----------

export const WHATS_ON_WINDOW_DAYS = 14;
export const WHATS_ON_MAX = 8;

/** What the card set shows: today onwards, next 14 days, soonest first, at most 8. Past events drop off on their own. */
export function upcomingWhatsOn<T extends Pick<WhatsOnFeedEvent, "start_date" | "start_time" | "title">>(events: T[], today: string): T[] {
  const last = addDays(today, WHATS_ON_WINDOW_DAYS - 1);
  return events
    .filter((e) => e.start_date >= today && e.start_date <= last)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time ?? "99").localeCompare(b.start_time ?? "99") || a.title.localeCompare(b.title))
    .slice(0, WHATS_ON_MAX);
}

export type EventGroup = "Tonight" | "Today" | "This weekend" | "This week" | "Next week" | "Coming up";

/** Reader-facing group: Tonight / This weekend / Next week (with Today / This week / Coming up for the gaps). */
export function eventGroup(e: Pick<WhatsOnFeedEvent, "start_date" | "start_time">, today: string): EventGroup {
  const d = daysBetween(today, e.start_date);
  if (d <= 0) return evening(e.start_time) ? "Tonight" : "Today";
  const toSunday = (7 - ymdToUtc(today).getUTCDay()) % 7;
  if (d <= toSunday) {
    const dow = ymdToUtc(e.start_date).getUTCDay();
    return dow === 5 || dow === 6 || dow === 0 ? "This weekend" : "This week";
  }
  if (d <= toSunday + 7) return "Next week";
  return "Coming up";
}

/** Short day for the cover line: "Tonight", "Tomorrow", "Sat". */
export function shortDay(e: Pick<WhatsOnFeedEvent, "start_date" | "start_time">, today: string): string {
  const d = daysBetween(today, e.start_date);
  if (d <= 0) return evening(e.start_time) ? "Tonight" : "Today";
  if (d === 1) return "Tomorrow";
  return fmt(e.start_date, { weekday: "short" });
}

/** Cover lines that earn the stop: the first two or three events, then "+ N more". */
export function coverLines<T extends Pick<WhatsOnFeedEvent, "start_date" | "start_time" | "title">>(events: T[], today: string) {
  const shown = events.length <= 3 ? events : events.slice(0, 2);
  return { lines: shown.map((e) => ({ day: shortDay(e, today), title: e.title })), more: events.length - shown.length };
}

/** "Tonight: Jazz at The Lamb · Sat: The Nutcracker + 6 more" */
export function coverSentence<T extends Pick<WhatsOnFeedEvent, "start_date" | "start_time" | "title">>(events: T[], today: string): string {
  const { lines, more } = coverLines(events, today);
  const body = lines.map((l) => `${l.day}: ${l.title}`).join(" · ");
  return more > 0 ? `${body} + ${more} more` : body;
}

// ---------- the Desk ----------

/** Below this an event ranks under local ones in Waiting (mirrors LOW_RELEVANCE on the server). */
export const LOW_RELEVANCE = 25;

export const isLowRelevance = (score: number | null | undefined): boolean =>
  score !== null && score !== undefined && score < LOW_RELEVANCE;

/** Why an event is in Hidden, in the owner's words. */
export function hiddenReason(status: string, reason: string | null | undefined): string {
  if (status === "deleted") return "Skipped";
  if (reason === "online") return "Out of area · online";
  if (reason === "unconfirmed") return "Couldn't confirm it's local";
  return "Out of area";
}

/** One row per event name (repeat dates and repeat listings collapse to the soonest). */
export function onePerTitle<T extends { title: string; start_date: string }>(events: T[]): T[] {
  const seen = new Map<string, T>();
  for (const e of [...events].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const k = e.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.values()];
}

/** Preview line under "Found N…"; hidden at zero. */
export function hiddenSentence(excluded: number | null | undefined): string | null {
  const n = Number(excluded) || 0;
  if (n <= 0) return null;
  return `${n} out-of-area ${n === 1 ? "event goes" : "events go"} straight to Hidden.`;
}
