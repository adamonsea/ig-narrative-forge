/**
 * Dummy data and pure rules for the hidden events + Desk mock (/dashboard/mock/events-desk).
 * Nothing here touches real data. Rules are kept pure so the real build can reuse them.
 */
// ---------- dates ----------

const DAY = 86_400_000;
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const fromYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const addDays = (ymd: string, n: number) => toYmd(new Date(fromYmd(ymd).getTime() + n * DAY));
const daysBetween = (from: string, to: string) => Math.round((fromYmd(to).getTime() - fromYmd(from).getTime()) / DAY);

/** Today's date in the UK, as YYYY-MM-DD. */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// ---------- events ----------

export interface MockEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, 24h
  venue: string;
  sourceName: string;
  sourceUrl: string;
}

export const WHATS_ON_WINDOW_DAYS = 14;
export const WHATS_ON_MAX = 8;

const byStart = (a: MockEvent, b: MockEvent) =>
  a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title);

/** What the card shows: today onwards, next 14 days, soonest first, at most 8. Past events drop off on their own. */
export function upcomingWhatsOn(events: MockEvent[], today: string): MockEvent[] {
  const last = addDays(today, WHATS_ON_WINDOW_DAYS - 1);
  return events.filter((e) => e.date >= today && e.date <= last).sort(byStart).slice(0, WHATS_ON_MAX);
}

export type EventGroup = "Tonight" | "Today" | "This weekend" | "This week" | "Next week" | "Coming up";

/** Reader-facing group: Tonight / This weekend / Next week (with Today / This week / Coming up for the gaps). */
export function eventGroup(e: Pick<MockEvent, "date" | "time">, today: string): EventGroup {
  const d = daysBetween(today, e.date);
  if (d <= 0) return e.time && Number(e.time.slice(0, 2)) >= 17 ? "Tonight" : "Today";
  const dow = fromYmd(today).getUTCDay(); // 0 Sun … 6 Sat
  const toSunday = (7 - dow) % 7;
  if (d <= toSunday) {
    const eDow = fromYmd(e.date).getUTCDay();
    return eDow === 5 || eDow === 6 || eDow === 0 ? "This weekend" : "This week";
  }
  if (d <= toSunday + 7) return "Next week";
  return "Coming up";
}

/** Short day for the cover line: "Tonight", "Tomorrow", "Sat". */
export function shortDay(e: Pick<MockEvent, "date" | "time">, today: string): string {
  const d = daysBetween(today, e.date);
  if (d <= 0) return e.time && Number(e.time.slice(0, 2)) >= 17 ? "Tonight" : "Today";
  if (d === 1) return "Tomorrow";
  return fromYmd(e.date).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

/** Cover lines that earn the stop: the first two or three events, then "+ N more". */
export function coverLines(events: MockEvent[], today: string): { lines: { day: string; title: string }[]; more: number } {
  const shown = events.length <= 3 ? events : events.slice(0, 2);
  return { lines: shown.map((e) => ({ day: shortDay(e, today), title: e.title })), more: events.length - shown.length };
}

/** "Tonight: Jazz at The Lamb · Sat: The Nutcracker + 6 more" */
export function coverSentence(events: MockEvent[], today: string): string {
  const { lines, more } = coverLines(events, today);
  const body = lines.map((l) => `${l.day}: ${l.title}`).join(" · ");
  return more > 0 ? `${body} + ${more} more` : body;
}

export function badge(ymd: string) {
  const d = fromYmd(ymd);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  return { weekday: f({ weekday: "short" }).toUpperCase(), day: String(d.getUTCDate()), month: f({ month: "short" }).toUpperCase() };
}

export function timeLabel(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
}

// ---------- placement ----------

/** The What's on card sits in the first screenful, after this story. */
export const WHATS_ON_FIRST_AFTER = 1;
/** Then no more often than every this-many stories. */
export const WHATS_ON_MIN_GAP = 15;

/**
 * Story numbers the What's on card sits after (1 = after the first story).
 * Never in the same gap as another extra card (that would put the two side by side).
 */
export function whatsOnPositions(storyCount: number, otherExtras: number[]): number[] {
  const taken = new Set(otherExtras);
  const out: number[] = [];
  let next = WHATS_ON_FIRST_AFTER;
  while (next < storyCount) {
    while (taken.has(next)) next += 1;
    if (next >= storyCount) break;
    out.push(next);
    next += WHATS_ON_MIN_GAP;
  }
  return out;
}

/** The feed's email sign-up card: after stories 3 and 13, then every 15. */
export function signupPositions(storyCount: number): number[] {
  const out: number[] = [];
  for (let n = 3; n < storyCount; n = n === 3 ? 13 : n + 15) out.push(n);
  return out;
}

// ---------- sources ----------

export type SourceKind = "rss" | "website" | "whats_on_page" | "calendar_feed";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  rss: "RSS",
  website: "Website",
  whats_on_page: "What's-on page",
  calendar_feed: "Calendar feed",
};

/** Work out what kind of source a pasted link is, so the owner never has to choose. */
export function detectSourceKind(raw: string): SourceKind {
  const url = raw.trim().toLowerCase();
  if (/^webcal:|\.ics(\?|#|$)|[?&]format=(ical|ics|json)|\/ical\b|\.json(\?|#|$)|\/ajax|\/api\//.test(url)) return "calendar_feed";
  if (/\/(feed|rss|atom)(\/|\?|#|$)|\.(xml|rss|atom)(\?|#|$)|[?&]feed=rss/.test(url)) return "rss";
  if (/(whats-?on|what-s-on|\/events?(\/|\?|#|$)|listings|\/gigs|\/calendar|\/diary)/.test(url)) return "whats_on_page";
  return "website";
}

export interface MockSource {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  autoPublish: boolean;
}

// ---------- stories ----------

export interface MockStory {
  id: string;
  title: string;
  sourceId: string;
  image?: string;
  slides: string[]; // slide 2+
  author?: string;
}

export type WaitingItem =
  | { type: "story"; id: string; minsAgo: number; story: MockStory }
  | { type: "event"; id: string; minsAgo: number; sourceId: string; event: MockEvent };

export interface MockState {
  today: string;
  sources: MockSource[];
  waiting: WaitingItem[];
  live: MockStory[]; // feed order, newest first
  liveEvents: MockEvent[];
}


export const sourceById = (state: Pick<MockState, "sources">, id: string) => state.sources.find((s) => s.id === id);
