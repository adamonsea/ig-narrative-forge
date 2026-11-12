/**
 * What's-on page reader: pure helpers (no network, no database) so every rule
 * can be tested. Data contract is deliberately tiny — title, start date/time,
 * venue and a link. Nothing else is kept.
 *
 * Order of trust:
 *   1. schema.org/Event JSON-LD on the page
 *   2. an iCal (.ics) or JSON calendar feed
 *   3. plain-text fallback — candidates are only kept when their date text
 *      (and title) appear on the page verbatim. Dates are parsed from that
 *      page text by these rules, never taken from a model.
 */

export interface WhatsOnEvent {
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  venue: string | null;
  url: string | null;
}

export type WhatsOnMethod = 'jsonld' | 'ical' | 'json' | 'text';

const LONDON = 'Europe/London';

// ---------- small text helpers ----------

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&rsquo;|&lsquo;|&#8217;|&#8216;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function clean(s: unknown, max = 300): string | null {
  if (typeof s !== 'string') return null;
  const t = decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function absolute(href: string | null | undefined, base: string): string | null {
  if (!href || typeof href !== 'string') return null;
  try {
    const u = new URL(href.trim().replace(/^webcal:/i, 'https:'), base);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Readable page text: drops scripts, styles, nav, header, footer and forms. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|time|span)>/gi, ' \n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Lower-case, unify dashes/quotes and collapse whitespace — for "does this text appear on the page". */
export function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pageName(html: string, url: string): string {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)?.[1];
  if (og) return clean(og, 120) || hostLabel(url);
  return hostLabel(url);
}

export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---------- dates ----------

const pad = (n: number) => String(n).padStart(2, '0');

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** UTC instant -> London wall-clock date and time. */
function londonParts(date: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:00` };
}

/**
 * ISO-like date string as published. Wall-clock times with an offset are kept
 * as written (the venue's local time); a bare "Z" is converted to London time.
 */
export function parseIsoLike(value: unknown): { date: string; time: string | null } | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, , tz] = m;
  if (!isValidYmd(+y, +mo, +d)) return null;
  if (hh === undefined) return { date: `${y}-${mo}-${d}`, time: null };
  if (+hh > 23 || +mm > 59) return null;
  if (tz === 'Z') return londonParts(new Date(s));
  const time = hh === '00' && mm === '00' ? null : `${hh}:${mm}:00`;
  return { date: `${y}-${mo}-${d}`, time };
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAY_RE = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
const ORD = '(?:st|nd|rd|th)?';

function weekdayOf(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Date written on the page -> YYYY-MM-DD. Accepts "Thu 4 Dec", "4th December 2026",
 * "December 4, 2026", "04/12/2026" (UK order), "2026-12-04" and ranges ("4–6 Dec",
 * first day kept). When the page gives no year, the next occurrence on or after
 * today is used; a written weekday must agree with that date or the event is dropped.
 */
export function parseDateText(text: string, today: string): string | null {
  const s = normaliseForMatch(text);
  const [ty, tm, td] = today.split('-').map(Number);

  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso && isValidYmd(+iso[1], +iso[2], +iso[3])) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const num = s.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/);
  if (num) {
    const y = num[3].length === 2 ? 2000 + +num[3] : +num[3];
    if (isValidYmd(y, +num[2], +num[1])) return `${y}-${pad(+num[2])}-${pad(+num[1])}`;
  }

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  // 4 Dec / 4th December 2026 / 4 - 6 Dec 2026
  const dm = s.match(new RegExp(`\\b(\\d{1,2})${ORD}(?:\\s*-\\s*\\d{1,2}${ORD})?\\s+(?:of\\s+)?${MONTH_RE}\\b\\.?(?:,?\\s+(\\d{4}))?`));
  // December 4, 2026 / Dec 4th
  const md = s.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})${ORD}\\b(?:\\s*-\\s*\\d{1,2}${ORD})?(?:,?\\s+(\\d{4}))?`));
  if (dm && (!md || (dm.index ?? 0) <= (md.index ?? 0))) {
    day = +dm[1]; month = MONTHS[dm[2]]; year = dm[3] ? +dm[3] : null;
  } else if (md) {
    month = MONTHS[md[1]]; day = +md[2]; year = md[3] ? +md[3] : null;
  }
  if (!day || !month) return null;

  const wdMatch = s.match(new RegExp(`\\b${WEEKDAY_RE}\\b`));
  const weekday = wdMatch ? WEEKDAYS[wdMatch[1]] : null;

  if (year) {
    if (!isValidYmd(year, month, day)) return null;
    if (weekday !== null && weekdayOf(year, month, day) !== weekday) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const thisYearPassed = month < tm || (month === tm && day < td);
  const candidates = thisYearPassed ? [ty + 1] : [ty, ty + 1];
  for (const y of candidates) {
    if (!isValidYmd(y, month, day)) continue;
    if (weekday !== null && weekdayOf(y, month, day) !== weekday) continue;
    return `${y}-${pad(month)}-${pad(day)}`;
  }
  return null;
}

/** "7.30pm", "7:30 pm", "7pm", "19:30" -> "19:30:00". */
export function parseTimeText(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.toLowerCase();
  const ampm = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let h = +ampm[1];
    const m = ampm[2] ? +ampm[2] : 0;
    if (h < 1 || h > 12 || m > 59) return null;
    if (ampm[3] === 'pm' && h !== 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    return `${pad(h)}:${pad(m)}:00`;
  }
  const h24 = s.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (h24) return `${pad(+h24[1])}:${h24[2]}:00`;
  return null;
}

// ---------- 1. JSON-LD ----------

function typeIsEvent(t: unknown): boolean {
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === 'string' && /Event$/i.test(x.replace(/^https?:\/\/schema\.org\//i, '')));
}

function venueName(location: unknown): string | null {
  const loc = Array.isArray(location) ? location[0] : location;
  if (!loc) return null;
  if (typeof loc === 'string') return clean(loc, 160);
  if (typeof loc === 'object') {
    const o = loc as Record<string, unknown>;
    if (o['@type'] === 'VirtualLocation') return null;
    return clean(o.name, 160);
  }
  return null;
}

export function extractJsonLdEvents(html: string, pageUrl: string): WhatsOnEvent[] {
  const out: WhatsOnEvent[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const visit = (node: unknown, depth: number) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (typeIsEvent(o['@type']) && o.startDate) {
      const when = parseIsoLike(o.startDate);
      const title = clean(o.name);
      if (when && title) {
        out.push({
          title,
          start_date: when.date,
          start_time: when.time,
          venue: venueName(o.location),
          url: absolute(typeof o.url === 'string' ? o.url : null, pageUrl),
        });
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v, depth + 1);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--|-->$/g, '');
    try { visit(JSON.parse(raw), 0); } catch { /* skip broken block */ }
  }
  return out;
}

// ---------- 2. iCal / JSON feeds ----------

/** Calendar feed links advertised by the page. */
export function findCalendarFeedLinks(html: string, pageUrl: string): string[] {
  const found = new Set<string>();
  const linkRe = /<link[^>]+type=["']text\/calendar["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
    const abs = absolute(href ? decodeEntities(href) : null, pageUrl);
    if (abs) found.add(abs);
  }
  const aRe = /href=["']([^"']+)["']/gi;
  while ((m = aRe.exec(html))) {
    const href = decodeEntities(m[1]);
    if (/^webcal:/i.test(href) || /\.ics(\?|#|$)/i.test(href) || /[?&](ical|outlook-ical)=1\b/i.test(href)) {
      const abs = absolute(href, pageUrl);
      if (abs) found.add(abs);
    }
  }
  return [...found].slice(0, 3);
}

function icsUnescape(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

function parseIcsDate(prop: string, value: string): { date: string; time: string | null } | null {
  const v = value.trim();
  const dOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dOnly || /VALUE=DATE(?!-)/i.test(prop)) {
    const d = v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!d || !isValidYmd(+d[1], +d[2], +d[3])) return null;
    return { date: `${d[1]}-${d[2]}-${d[3]}`, time: null };
  }
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dt || !isValidYmd(+dt[1], +dt[2], +dt[3])) return null;
  if (dt[7] === 'Z') {
    return londonParts(new Date(Date.UTC(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5], +(dt[6] || 0))));
  }
  return { date: `${dt[1]}-${dt[2]}-${dt[3]}`, time: `${dt[4]}:${dt[5]}:00` };
}

export function parseIcs(text: string, feedUrl: string): WhatsOnEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) return [];
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: WhatsOnEvent[] = [];
  let cur: Record<string, { prop: string; value: string }> | null = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (cur) {
        const when = cur.DTSTART ? parseIcsDate(cur.DTSTART.prop, cur.DTSTART.value) : null;
        const title = cur.SUMMARY ? clean(icsUnescape(cur.SUMMARY.value)) : null;
        const status = cur.STATUS?.value.trim().toUpperCase();
        if (when && title && status !== 'CANCELLED') {
          out.push({
            title,
            start_date: when.date,
            start_time: when.time,
            venue: cur.LOCATION ? clean(icsUnescape(cur.LOCATION.value).split(',')[0], 160) : null,
            url: absolute(cur.URL ? icsUnescape(cur.URL.value) : null, feedUrl),
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const prop = line.slice(0, idx);
    const name = prop.split(';')[0].toUpperCase();
    if (!cur[name]) cur[name] = { prop, value: line.slice(idx + 1) };
  }
  return out;
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = k.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), o);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function parseJsonFeed(data: unknown, feedUrl: string): WhatsOnEvent[] {
  let list: unknown = data;
  if (list && !Array.isArray(list) && typeof list === 'object') {
    const o = list as Record<string, unknown>;
    list = o.events ?? o.items ?? o.data ?? o.results ?? null;
  }
  if (!Array.isArray(list)) return [];
  const out: WhatsOnEvent[] = [];
  for (const item of list.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const when = parseIsoLike(pick(o, ['startDate', 'start_date', 'start', 'start.dateTime', 'start.date', 'start_time', 'dtstart', 'date', 'datetime']));
    const title = clean(pick(o, ['title.rendered', 'name', 'title', 'summary']));
    if (!when || !title) continue;
    const venue = pick(o, ['venue.venue', 'venue.name', 'location.name', 'venue', 'location']);
    out.push({
      title,
      start_date: when.date,
      start_time: when.time,
      venue: typeof venue === 'string' ? clean(venue, 160) : null,
      url: absolute(pick(o, ['url', 'link', 'permalink', 'htmlLink']) as string, feedUrl),
    });
  }
  return out;
}

// ---------- 3. plain-text fallback (verification) ----------

export interface TextCandidate {
  title?: unknown;
  date_text?: unknown;
  time_text?: unknown;
  venue?: unknown;
}

/** Anchor text -> href, for giving text-fallback events their own link when the page has one. */
export function anchorLinks(html: string, pageUrl: string): { text: string; url: string }[] {
  const out: { text: string; url: string }[] = [];
  const re = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = clean(m[2], 300);
    const url = absolute(decodeEntities(m[1]), pageUrl);
    if (text && url && text.length >= 4) out.push({ text: normaliseForMatch(text), url });
  }
  return out;
}

/**
 * Keep a candidate only if its title and date text both appear on the page,
 * then parse the date from that page text. A time is kept only if it also appears.
 */
export function verifyTextCandidates(
  candidates: TextCandidate[],
  pageText: string,
  pageUrl: string,
  today: string,
  links: { text: string; url: string }[] = [],
): WhatsOnEvent[] {
  const page = normaliseForMatch(pageText);
  const out: WhatsOnEvent[] = [];
  for (const c of candidates) {
    const title = clean(c.title);
    const dateText = clean(c.date_text, 120);
    if (!title || !dateText || title.length < 3 || dateText.length < 3) continue;
    if (!page.includes(normaliseForMatch(dateText))) continue;
    if (!page.includes(normaliseForMatch(title))) continue;
    const date = parseDateText(dateText, today);
    if (!date) continue;
    const timeText = clean(c.time_text, 40);
    const time = timeText && page.includes(normaliseForMatch(timeText)) ? parseTimeText(timeText) : null;
    const venue = clean(c.venue, 160);
    const t = normaliseForMatch(title);
    const link = links.find((l) => l.text === t) || links.find((l) => l.text.includes(t));
    out.push({
      title,
      start_date: date,
      start_time: time,
      venue: venue && page.includes(normaliseForMatch(venue)) ? venue : null,
      url: link?.url ?? pageUrl,
    });
  }
  return out;
}

// ---------- shared ----------

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function londonToday(now = new Date()): string {
  return londonParts(now).date;
}

/** Upcoming only (today .. today+daysAhead), one per title/date/time, sorted by date. */
export function upcomingUnique(events: WhatsOnEvent[], today: string, daysAhead = 90, max = 200): WhatsOnEvent[] {
  const end = addDays(today, daysAhead);
  const seen = new Set<string>();
  return events
    .filter((e) => e.start_date >= today && e.start_date <= end)
    .filter((e) => {
      const k = `${normaliseForMatch(e.title)}|${e.start_date}|${e.start_time ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.start_date + (a.start_time ?? '')).localeCompare(b.start_date + (b.start_time ?? '')))
    .slice(0, max);
}

// ---------- robots.txt ----------

/** True when robots.txt lets our agent (or "*") fetch this URL. Empty/missing/HTML robots = allowed. */
export function robotsAllows(robotsTxt: string | null, url: string, agent = 'curatrevents'): boolean {
  if (!robotsTxt || /<html/i.test(robotsTxt)) return true;
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return false;
  }
  type Group = { agents: string[]; rules: { allow: boolean; pattern: string }[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (cur && value) cur.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const re = new RegExp('^' + r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path)) {
      const len = r.pattern.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
    }
  }
  return best ? best.allow : true;
}
