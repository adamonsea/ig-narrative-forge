import { priceFacts, shortDescription } from '../_shared/eventCategories.ts';
import { IMAGE_KEYS, imageAddress } from './eventImage.ts';
/**
 * What's-on page reader: pure helpers (no network, no database) so every rule
 * can be tested. Data contract is deliberately tiny — title, start date/time,
 * venue and a link. Nothing else is kept.
 *
 * Order of trust:
 *   1. schema.org/Event JSON-LD on the page
 *   2. an iCal (.ics) or JSON calendar feed
 *   3. the page's own calendar data — the JSON a listings widget loads after
 *      the page opens, found in the page's scripts (pageData.ts)
 *   4. plain-text fallback — candidates are only kept when their date text
 *      (and title) appear on the page verbatim. Dates are parsed from that
 *      page text by these rules, never taken from a model.
 */

export interface WhatsOnEvent {
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  venue: string | null;
  url: string | null;
  /** Fuller address text, used only for the location check — never stored. */
  place?: string | null;
  /** The source marks it as online-only. */
  online?: boolean;
  /** Short plain-text description, when the source gives one. */
  description?: string | null;
  /** Stated price ("€12") — null when the source doesn't say. */
  price?: string | null;
  /** True only when the source says it's free. */
  is_free?: boolean | null;
  /** The source's own category or schema.org type, for categorizeEvent(). */
  hint?: string | null;
  /** The listing's own picture (https), when it gives one; checked again before use. */
  image?: string | null;
}

export type WhatsOnMethod = 'jsonld' | 'ical' | 'json' | 'text';
// 'json' covers both advertised JSON feeds and the page's own calendar data (see pageData.ts).

const LONDON = 'Europe/London';

/** Only listings with a picture carry the field. */
const withImage = (image: string | null) => (image ? { image } : {});

function hintText(...vals: unknown[]): string | null {
  const out: string[] = [];
  const add = (v: unknown, d = 0) => {
    if (d > 2 || v == null) return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => add(x, d + 1));
    else if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const own = o.name ?? o.slug ?? o.title;
      if (own != null) add(own, d + 1);
      else Object.values(o).forEach((x) => add(x, d + 1)); // slug-keyed maps ({ "music": { name } })
    }
  };
  vals.forEach((v) => add(v));
  const t = out.map((x) => x.trim()).filter((x) => x && !/^(event|events)$/i.test(x)).join(' ');
  return t ? t.slice(0, 200) : null;
}

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

/**
 * Month and weekday words, English plus the main European languages, written without
 * accents (page text is accent-stripped before matching). Short forms that are also
 * everyday English words ("out", "set", "ago") are left out on purpose.
 */
const MONTHS: Record<string, number> = {
  // English
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  // Portuguese
  janeiro: 1, fev: 2, fevereiro: 2, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dez: 12, dezembro: 12,
  // Spanish
  ene: 1, enero: 1, febrero: 2, marzo: 3, mayo: 5, junio: 6, julio: 7, septiembre: 9, setiembre: 9,
  octubre: 10, noviembre: 11, dic: 12, diciembre: 12,
  // French
  janv: 1, janvier: 1, fevr: 2, fevrier: 2, mars: 3, avr: 4, avril: 4, juin: 6, juil: 7, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  // German
  januar: 1, februar: 2, marz: 3, maerz: 3, juni: 6, juli: 7, oktober: 10, okt: 10, dezember: 12,
  // Italian
  gennaio: 1, febbraio: 2, aprile: 4, maggio: 5, giugno: 6, luglio: 7, settembre: 9, ottobre: 10, dicembre: 12,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
  // Full names only in other languages, so a word like "quinta" (an estate) is never read as a day
  domingo: 0, 'segunda-feira': 1, 'terca-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5, sabado: 6,
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5,
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5,
};
const alternation = (words: Record<string, number>) =>
  `(${Object.keys(words).sort((a, b) => b.length - a.length).map((w) => w.replace(/-/g, '\\-')).join('|')})`;
const MONTH_RE = alternation(MONTHS);
const WEEKDAY_RE = alternation(WEEKDAYS);
const ORD = '(?:st|nd|rd|th|\\.)?';
// "of" (English) and "de"/"di" (Portuguese, Spanish, French, Italian) may sit between day, month and year
const LINK = '(?:\\s+(?:of|de|di))?';

/** Lower-case, accent-free text for reading dates ("março" -> "marco"). */
const dateText = (text: string) => normaliseForMatch(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
  const s = dateText(text);
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

  // 4 Dec / 4th December 2026 / 4 - 6 Dec 2026 / 18 de novembro de 2026 / 18. November 2026
  const dm = s.match(new RegExp(`\\b(\\d{1,2})${ORD}(?:\\s*-\\s*\\d{1,2}${ORD})?${LINK}\\s+${MONTH_RE}\\b\\.?(?:,?${LINK}\\s+(\\d{4}))?`));
  // December 4, 2026 / Dec 4th
  const md = s.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})${ORD}(?!\\d)(?:\\s*-\\s*\\d{1,2}${ORD})?(?:,?\\s+(\\d{4}))?`));
  const first = dm && (!md || (dm.index ?? 0) <= (md.index ?? 0)) ? dm : md;
  if (first === dm && dm) {
    day = +dm[1]; month = MONTHS[dm[2]]; year = dm[3] ? +dm[3] : null;
  } else if (md) {
    month = MONTHS[md[1]]; day = +md[2]; year = md[3] ? +md[3] : null;
  }
  if (!day || !month) return null;

  // A range written "3 November to 18 December 2026" gives its year only at the end
  if (!year) {
    const rest = s.slice(first?.index ?? 0);
    const later = rest.match(new RegExp(`${MONTH_RE}\\b\\.?(?:,?${LINK}\\s+(\\d{4}))`, 'g'));
    const endYear = later?.map((x) => +x.slice(-4)).find((y) => y > 1900);
    const endMonth = later?.length ? MONTHS[later[later.length - 1].match(new RegExp(MONTH_RE))![1]] : null;
    if (endYear && endMonth) year = month > endMonth ? endYear - 1 : endYear;
  }

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
  // "7-10pm" / "7.30 - 9pm": the start takes the end's am/pm when it has none
  const range = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*[-–—]\s*\d{1,2}(?:[:.]\d{2})?\s*(am|pm)\b/);
  if (range) {
    let h = +range[1];
    const m = range[2] ? +range[2] : 0;
    const mer = range[3] || range[4];
    if (h >= 1 && h <= 12 && m <= 59) {
      if (mer === 'pm' && h !== 12) h += 12;
      if (mer === 'am' && h === 12) h = 0;
      return `${pad(h)}:${pad(m)}:00`;
    }
  }
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

/** Venue name plus address parts, for the location check only. */
function placeText(location: unknown): string | null {
  const loc = Array.isArray(location) ? location[0] : location;
  if (!loc) return null;
  if (typeof loc === 'string') return clean(loc, 300);
  if (typeof loc !== 'object') return null;
  const o = loc as Record<string, unknown>;
  const parts: unknown[] = [o.name];
  const addr = o.address;
  if (typeof addr === 'string') parts.push(addr);
  else if (addr && typeof addr === 'object') {
    const a = addr as Record<string, unknown>;
    parts.push(a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode);
  }
  const text = parts.map((x) => clean(x, 120)).filter(Boolean).join(', ');
  return text || null;
}

function isOnlineOnly(o: Record<string, unknown>): boolean {
  const mode = String(o.eventAttendanceMode ?? '');
  if (/Online/i.test(mode) && !/Mixed/i.test(mode)) return true;
  const loc = Array.isArray(o.location) ? o.location : [o.location];
  return loc.length > 0 && loc.every((l) => l && typeof l === 'object' && (l as Record<string, unknown>)['@type'] === 'VirtualLocation');
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
          place: placeText(o.location),
          online: isOnlineOnly(o),
          description: shortDescription(typeof o.description === 'string' ? decodeEntities(o.description) : null),
          ...priceFacts(o.offers, o.isAccessibleForFree),
          hint: hintText(o['@type'], o.keywords, o.genre, o.about),
          ...withImage(imageAddress(o.image, pageUrl)),
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
            place: cur.LOCATION ? clean(icsUnescape(cur.LOCATION.value), 300) : null,
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

/** Value at a dotted path; keys match case-insensitively ("Url" finds "url"). */
function at(o: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object' || Array.isArray(acc)) return undefined;
    const rec = acc as Record<string, unknown>;
    if (part in rec) return rec[part];
    const lower = part.toLowerCase();
    const key = Object.keys(rec).find((k) => k.toLowerCase() === lower);
    return key === undefined ? undefined : rec[key];
  }, o);
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = at(o, k);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const TITLE_KEYS = ['title.rendered', 'EventNameOverride', 'eventName', 'event_name', 'name', 'title', 'summary', 'headline'];
const DATE_KEYS = [
  'startDate', 'start_date', 'start.dateTime', 'start.date', 'start', 'dtstart', 'startDateTime', 'start_datetime',
  'EventDates.EventDate', 'eventDate', 'event_date', 'FirstDate', 'InstanceDate', 'date', 'datetime', 'dateTime', 'start_time',
];
const START_KEYS = DATE_KEYS.filter((k) => /start|first/i.test(k));
const TIME_KEYS = ['EventTime', 'eventTime', 'startTime', 'start_time', 'time', 'doors'];
const URL_KEYS = ['url', 'link', 'permalink', 'htmlLink', 'eventUrl', 'event_url', 'pageUrl', 'BookingLink', 'bookingUrl', 'ticketUrl'];
const VENUE_KEYS = ['venue.venue', 'venue.name', 'location.name', 'venueName', 'venue_name', 'venue', 'location'];

/** The first date field that holds a real published date (ISO-like only — never guessed). */
function eventWhen(o: Record<string, unknown>, keys: string[]): { date: string; time: string | null } | null {
  for (const k of keys) {
    const when = parseIsoLike(at(o, k));
    if (when) {
      if (when.time) return when;
      const t = pick(o, TIME_KEYS);
      return { date: when.date, time: typeof t === 'string' && !/^\d{4}-/.test(t) ? parseTimeText(t) : null };
    }
  }
  return null;
}

/** Venue name from a string, { name }, a list, or a slug-keyed map ({ "lx-factory": { name } }). */
function venueFrom(v: unknown, depth = 0): string | null {
  if (typeof v === 'string') return clean(v, 160);
  if (!v || typeof v !== 'object' || depth > 2) return null;
  if (Array.isArray(v)) return venueFrom(v[0], depth + 1);
  const o = v as Record<string, unknown>;
  if (typeof o.name === 'string' || typeof o.venue === 'string') return clean(o.name ?? o.venue, 160);
  const first = Object.values(o).find((x) => x && typeof x === 'object');
  return first ? venueFrom(first, depth + 1) : null;
}

export interface JsonFeedOptions {
  /** Only fields that name a start ("StartDate", "start_date" …); generic "date" can be a publish date. */
  startOnly?: boolean;
}

/**
 * Price some WordPress listings (Agenda LX) keep as a PHP-serialised list:
 * a:1:{i:0;a:1:{s:5:"value";s:2:"12";}} → "12". First value only; undefined otherwise.
 */
export function listedPriceValue(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.includes('"value"')) return undefined;
  const m = v.match(/s:5:"value";s:\d+:"([^"]*)"/);
  return m?.[1]?.trim() || undefined;
}

function jsonEvent(o: Record<string, unknown>, feedUrl: string, fallbackPlace: string | null, opts: JsonFeedOptions): WhatsOnEvent | null {
  const when = eventWhen(o, opts.startOnly ? START_KEYS : DATE_KEYS);
  const title = clean(pick(o, TITLE_KEYS));
  if (!when || !title) return null;
  const venue = venueFrom(pick(o, VENUE_KEYS));
  const url = pick(o, URL_KEYS);
  return {
    title,
    start_date: when.date,
    start_time: when.time,
    venue,
    url: absolute(typeof url === 'string' ? url : null, feedUrl),
    place: placeText(pick(o, ['venue', 'location'])) ?? venue ?? fallbackPlace,
    description: shortDescription(((d) => (typeof d === 'string' ? decodeEntities(d) : Array.isArray(d) ? decodeEntities(d.filter((x) => typeof x === 'string').join(' ')) : null))(pick(o, ['description', 'excerpt.rendered', 'excerpt', 'details', 'content.rendered']))),
    ...priceFacts(o.offers, o.is_free ?? o.isAccessibleForFree ?? (o.price_cat === 'free' ? true : undefined), o.cost ?? (typeof o.price === 'string' || typeof o.price === 'number' ? String(o.price) : undefined) ?? listedPriceValue(o.price_val)),
    hint: hintText(o.categories, o.categories_name_list, o.category, o.subject, o.tags, o.tags_name_list, o.genre),
    ...withImage(imageAddress(pick(o, IMAGE_KEYS), feedUrl)),
  };
}

/**
 * Events from any JSON a calendar publishes, however it's nested
 * ({ events: [...] }, { Data: [{ Month, Events: [...] }] }, a bare list …).
 * A list counts as events when at least half its items have a title and an
 * ISO-like date; dates are read from the data by rule, never inferred.
 * fallbackPlace (e.g. the venue site's own name) is used only for the location check.
 */
export function parseJsonFeed(
  data: unknown, feedUrl: string, fallbackPlace: string | null = null, opts: JsonFeedOptions = {},
): WhatsOnEvent[] {
  const out: WhatsOnEvent[] = [];
  const walk = (node: unknown, depth: number) => {
    if (out.length >= 500 || depth > 7 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const items = node.slice(0, 500);
      const objects = items.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
      const parsed = objects.map((o) => jsonEvent(o, feedUrl, fallbackPlace, opts));
      const hits = parsed.filter((e): e is WhatsOnEvent => !!e);
      const isList = hits.length > 0 && hits.length * 2 >= objects.length;
      if (isList) out.push(...hits);
      const found = new Set(objects.filter((_, i) => parsed[i]));
      for (const x of items) {
        if (!(isList && found.has(x as Record<string, unknown>))) walk(x, depth + 1);
      }
      return;
    }
    for (const v of Object.values(node as Record<string, unknown>)) walk(v, depth + 1);
  };
  walk(data, 0);
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

/** Every index where needle occurs in haystack. */
function indexesOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = haystack.indexOf(needle);
  while (i >= 0 && out.length < 200) { out.push(i); i = haystack.indexOf(needle, i + 1); }
  return out;
}

/** Date text must sit next to the title: up to 2,000 characters before it (day headings) or 600 after. */
export function appearsNear(page: string, title: string, dateText: string, before = 2000, after = 600): boolean {
  const titles = indexesOf(page, title);
  if (!titles.length) return false;
  const dates = indexesOf(page, dateText);
  return dates.some((d) => titles.some((t) => (d <= t && t - d <= before) || (d > t && d - t <= after + title.length)));
}

/**
 * Keep a candidate only if its title and date text both appear on the page, close together,
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
    if (!appearsNear(page, normaliseForMatch(title), normaliseForMatch(dateText))) continue;
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
