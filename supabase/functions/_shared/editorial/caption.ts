/**
 * Editorial captions — pure code, shared by the app and edge functions.
 * Facts (date, time, venue, price, tickets) are only ever copied or converted here;
 * AI text (synopses, extra facts) arrives as ready fields and is slotted in.
 *
 * Template syntax, one string per line:
 *   {token}        a field; if empty the whole line is dropped
 *   [ ... ]        optional group; dropped (alone) when any token inside is empty
 *   ""             a blank line; repeated / leading / trailing blanks collapse
 */
export type CaptionFields = Record<string, string | null | undefined>;

const TOKEN = /\{([a-zA-Z_]+(?:\.[a-zA-Z-]+)?)\}/g;

function fill(part: string, fields: CaptionFields): string | null {
  let empty = false;
  const out = part.replace(TOKEN, (_m, key: string) => {
    const v = (fields[key] ?? "").trim();
    if (!v) empty = true;
    return v;
  });
  return empty ? null : out;
}

export function assembleCaption(template: readonly string[], fields: CaptionFields): string {
  const out: string[] = [];
  for (const line of template) {
    const withGroups = line.replace(/\[([^\]]*)\]/g, (_m, inner: string) => fill(inner, fields) ?? "");
    const filled = fill(withGroups, fields);
    if (filled === null) continue;
    if (line.trim() !== "" && filled.trim() === "") continue;
    if (filled === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(filled);
  }
  while (out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

// ---------- deterministic conversions ----------

const pad = (n: number) => String(n).padStart(2, "0");

/** "20h" / "20h30" / "8pm" / "20:00" / "20:00:00" → "20:00"; anything unclear → null. */
export function normaliseTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{1,2})(?:[h:.](\d{2})?(?::\d{2})?)$/);
  if (m) {
    const h = Number(m[1]), min = Number(m[2] ?? 0);
    return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
  }
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    const h = (Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0), min = Number(m[2] ?? 0);
    return Number(m[1]) <= 12 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
  }
  return null;
}

/** "2 hours before" with a 20:00 start → "18:00". Null when it can't be converted exactly. */
export function relativeBefore(phrase: string | null | undefined, start: string | null | undefined): string | null {
  const st = normaliseTime(start);
  const m = (phrase ?? "").toLowerCase().match(/(\d+)\s*(hours?|horas?|h\b|minutes?|minutos?|min\b)\s*(before|antes)/);
  if (!st || !m) return null;
  const [h, mi] = st.split(":").map(Number) as [number, number];
  const mins = h * 60 + mi - Number(m[1]) * (/^h/.test(m[2]!) ? 60 : 1);
  return mins < 0 ? null : `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export interface TicketFacts {
  collection_offset?: string | null; // "2 hours before"
  collection_time?: string | null; // "18h"
  max_per_person?: number | null;
  subject_to_capacity?: boolean | null;
  other?: string | null;
}

/** "collection from 18:00, max. 2 per person, subject to capacity" */
export function ticketNote(t: TicketFacts | null | undefined, start: string | null | undefined): string | null {
  if (!t) return null;
  const from = normaliseTime(t.collection_time) ?? relativeBefore(t.collection_offset, start);
  const parts = [
    from ? `collection from ${from}` : null,
    t.max_per_person ? `max. ${t.max_per_person} per person` : null,
    t.subject_to_capacity ? "subject to capacity" : null,
    t.other?.trim() || null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

const DAYS: Record<string, string[]> = {
  pt: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  fr: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
};

/** "Seg/Mon" for ["pt-PT","en"]; "Mon" for ["en"]. */
export function dayPair(ymd: string, languages: readonly string[]): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const names = [...new Set(languages.map((l) => DAYS[l.slice(0, 2).toLowerCase()]?.[wd] ?? DAYS["en"]![wd]!))];
  return names.join("/");
}

const UNTIL: Record<string, string> = { pt: "Até", en: "Until", es: "Hasta", fr: "Jusqu'au", de: "Bis", it: "Fino al" };
/** "Até/Until" in the profile's languages, in order. */
export function untilPair(languages: readonly string[]): string {
  return [...new Set(languages.map((l) => UNTIL[l.slice(0, 2).toLowerCase()] ?? UNTIL["en"]!))].join("/");
}

/** "23.11", or "20.11 → 31.12" for a run. */
export function dottedDate(start: string, end?: string | null): string {
  const f = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  return end && end > start ? `${f(start)} → ${f(end)}` : f(start);
}

const SYMBOL: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" };

/** "€12", "€7–12", free label, or the source's own words. Null when unknown. */
export function priceText(price: string | null | undefined, isFree: boolean | null | undefined, currency: string | null | undefined, freeLabel: string): string | null {
  if (isFree === true) return freeLabel;
  const p = price?.trim();
  if (!p) return null;
  const m = p.match(/^(From )?([€£$])?(\d+(?:[.,]\d{1,2})?)(?:\s*[–-]\s*(\d+(?:[.,]\d{1,2})?))?$/);
  if (!m) return p;
  const sym = m[2] ?? (currency ? SYMBOL[currency] : undefined);
  if (!sym) return null; // a bare amount with no known currency is never guessed
  return `${m[1] ?? ""}${sym}${m[3]}${m[4] ? `–${m[4]}` : ""}`;
}

/** Event hashtags: lower case, no accents, no spaces, at most `max`. */
export function cleanHashtags(tags: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  for (const t of tags) {
    const c = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (c) seen.add(`#${c}`);
  }
  return [...seen].slice(0, max);
}

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export interface CaptionEvent {
  title: string;
  festival?: string | null;
  subtitle?: string | null;
  start_date: string;
  /** First day of a run the source lists (exhibitions); start_date is then the next showing. */
  run_start?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  location?: string | null;
  price?: string | null;
  is_free?: boolean | null;
  ticket_note?: string | null;
  extra_facts?: string | null;
  event_hashtags?: readonly string[] | null;
  synopsis?: Record<string, string | null | undefined>;
}

export interface CaptionProfile {
  languages: readonly string[];
  fixed_hashtags: readonly string[];
  event_hashtag_max: number;
  labels: { free?: string; tickets?: string };
}

/** Every caption token, from stored fields only. */
export function captionFields(e: CaptionEvent, p: CaptionProfile, currency?: string | null, today?: string): CaptionFields {
  const runFirst = e.run_start && e.run_start < e.start_date ? e.run_start : e.start_date;
  const heading = (e.festival?.trim() || e.title).trim();
  const sub = (e.festival?.trim() ? e.title : e.subtitle)?.trim() ?? "";
  const fields: CaptionFields = {
    heading,
    subheading: sub && norm(sub) !== norm(heading) ? sub : "",
    title: e.title,
    festival: e.festival ?? "",
    day: dayPair(e.start_date, p.languages),
    date: dottedDate(e.start_date, e.end_date),
    // One-day: "Seg/Mon 23.11"; a run not yet started: "20.11 → 31.12"; a run already on: "Até/Until 31.12"
    when: e.end_date && e.end_date > e.start_date
      ? (runFirst < (today ?? e.start_date) ? `${untilPair(p.languages)} ${dottedDate(e.end_date)}` : dottedDate(runFirst, e.end_date))
      : `${dayPair(e.start_date, p.languages)} ${dottedDate(e.start_date)}`,
    time: normaliseTime(e.start_time) ?? "",
    venue: e.location ?? "",
    price: priceText(e.price, e.is_free, currency, p.labels.free ?? "Free") ?? "",
    tickets: p.labels.tickets ?? "",
    ticket_note: e.ticket_note ?? "",
    extra_facts: e.extra_facts ?? "",
    hashtags: [...p.fixed_hashtags, ...cleanHashtags(e.event_hashtags ?? [], p.event_hashtag_max)].join(" "),
  };
  for (const [lang, text] of Object.entries(e.synopsis ?? {})) fields[`synopsis.${lang}`] = text ?? "";
  return fields;
}

/** Fields a human edited are never overwritten by a re-gather or regeneration. */
export function mergeUnlocked<T extends Record<string, unknown>>(current: T, incoming: Partial<T>, locked: ReadonlySet<string>): T {
  const next = { ...current };
  for (const k of Object.keys(incoming) as (keyof T)[]) if (!locked.has(String(k))) next[k] = incoming[k] as T[keyof T];
  return next;
}

/** Stable fingerprint of the source facts (FNV-1a), so copy is rewritten only when they change. */
export function factsHash(e: Record<string, unknown>): string {
  // A run's next showing moves daily; its first day doesn't, so copy isn't rewritten every day
  if (e["run_start"]) e = { ...e, start_date: e["run_start"] };
  const keys = ["title", "start_date", "end_date", "start_time", "location", "price", "is_free", "description", "source_tags"];
  const s = keys.map((k) => JSON.stringify(e[k] ?? null)).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
