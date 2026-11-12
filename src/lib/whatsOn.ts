/** Small, testable rules for what's-on pages (events sources) in the Sources tab. */

/** A saved page is flagged once two checks in a row found no events. */
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

/**
 * One home for events: the Events switch collects events and adds them to the weekly email;
 * "Show in the feed" (only meaningful while Events is on) puts them between stories.
 */
export const showEventsInFeed = (eventsEnabled: boolean | null | undefined, showInFeed: boolean | null | undefined): boolean =>
  Boolean(eventsEnabled) && Boolean(showInFeed);

// ---------- "What's on" card sets in the feed ----------

export interface WhatsOnFeedEvent {
  id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  location: string | null;
  source_url: string | null;
  source_name: string | null;
}

/** Most events a single card set shows; sets are 3–4 events, balanced. */
export const EVENTS_PER_SET = 4;

/**
 * Spread events (soonest first) across the feed: each events slot gets its own
 * set of 3–4, so they're peppered through the feed instead of all in one place.
 */
export function splitIntoCardSets<T>(events: T[], maxPerSet = EVENTS_PER_SET): T[][] {
  if (!events.length) return [];
  if (events.length <= maxPerSet) return [events.slice()];
  const sets = Math.ceil(events.length / maxPerSet);
  const base = Math.floor(events.length / sets);
  const extra = events.length % sets;
  const out: T[][] = [];
  let i = 0;
  for (let s = 0; s < sets; s++) {
    const size = base + (s < extra ? 1 : 0);
    out.push(events.slice(i, i + size));
    i += size;
  }
  return out;
}

/** The set for the nth events slot in the feed; starts again from the soonest once every set has shown. */
export function cardSetForSlot<T>(sets: T[][], slot: number): T[] | null {
  if (!sets.length || slot < 0) return null;
  return sets[slot % sets.length];
}

const ymdToUtc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
  ymdToUtc(ymd).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

/** Date badge parts: THU / 12 / NOV */
export function dateBadge(ymd: string): { weekday: string; day: string; month: string } {
  return {
    weekday: fmt(ymd, { weekday: "short" }).toUpperCase(),
    day: String(Number(ymd.slice(8, 10))),
    month: fmt(ymd, { month: "short" }).toUpperCase(),
  };
}

/** "10:30am", "7pm"; null when no time was given. */
export function eventTime(hms: string | null | undefined): string | null {
  if (!hms) return null;
  const [h, m] = hms.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

/** The dates a set covers: "Today", "Sat 14 Nov", "Today – Sat 14 Nov", "Sat 28 Nov – Tue 1 Dec". */
export function cardSetDates(set: { start_date: string }[], today: string): string {
  if (!set.length) return "";
  const dates = set.map((e) => e.start_date).sort();
  const tomorrow = fmtYmd(new Date(ymdToUtc(today).getTime() + 86400000));
  const label = (d: string) =>
    d === today ? "Today" : d === tomorrow ? "Tomorrow" : fmt(d, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? label(first) : `${label(first)} – ${label(last)}`;
}

function fmtYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Today's date in London as YYYY-MM-DD (events are dated in UK local time). */
export function londonToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

// ---------- events left out (Sources tab) ----------

const LEFT_OUT_LABELS: Record<string, string> = {
  outside_area: "Outside your area",
  online: "Online only",
  unconfirmed: "Couldn't confirm it's local",
};

/** Why an event isn't in the feed, in the owner's words. */
export function leftOutReason(status: string, reason: string | null | undefined): string {
  if (status === "deleted") return "Removed by you";
  return LEFT_OUT_LABELS[reason ?? ""] ?? "Outside your area";
}

/** Preview line under "Found N…"; hidden at zero. */
export function leftOutSentence(excluded: number | null | undefined): string | null {
  const n = Number(excluded) || 0;
  if (n <= 0) return null;
  return `${n} ${n === 1 ? "event" : "events"} outside your area will be left out.`;
}
