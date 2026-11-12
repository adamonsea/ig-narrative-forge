/** Fetching and reading a what's-on page (network side). Rules live in extract.ts. */
import { z } from 'npm:zod@3';
import { createOpenAI } from 'npm:@ai-sdk/openai@4';
import { streamText, Output } from 'npm:ai@7';
import {
  type WhatsOnEvent, type WhatsOnMethod, extractJsonLdEvents, findCalendarFeedLinks, parseIcs,
  parseJsonFeed, htmlToText, verifyTextCandidates, anchorLinks, upcomingUnique, robotsAllows,
  pageName, londonToday,
} from './extract.ts';

const USER_AGENT = 'Mozilla/5.0 (compatible; CuratrEvents/1.0; +https://curatr.pro)';
const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 4_000_000;
export const DAYS_AHEAD = 90;
const AI_BASE_URL = 'https://ai.gateway.lovable.dev/v1';
const AI_MODEL = 'openai/gpt-6-astra';

// ---------- fetching ----------

export function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '[::1]') return false;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    if (h === 'metadata.google.internal') return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string, accept: string): Promise<{ ok: boolean; status: number; type: string; text: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, redirect: 'follow', signal: controller.signal });
    const buf = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    return { ok: res.ok, status: res.status, type: res.headers.get('content-type') || '', text, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

const robotsCache = new Map<string, string | null>();
async function allowedByRobots(url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  if (!robotsCache.has(origin)) {
    try {
      const r = await fetchText(`${origin}/robots.txt`, 'text/plain');
      robotsCache.set(origin, r.ok && !/html/i.test(r.type) ? r.text : null);
    } catch {
      robotsCache.set(origin, null);
    }
  }
  return robotsAllows(robotsCache.get(origin) ?? null, url);
}

// ---------- text fallback ----------

const CandidateSchema = z.object({
  events: z.array(z.object({
    title: z.string(),
    date_text: z.string(),
    time_text: z.string().nullable(),
    venue: z.string().nullable(),
  })),
});

async function textCandidates(pageText: string, url: string): Promise<unknown[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.warn('Text fallback skipped: LOVABLE_API_KEY not configured');
    return [];
  }
  try {
    const provider = createOpenAI({
      baseURL: AI_BASE_URL,
      apiKey,
      headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' },
    });
    const result = streamText({
      model: provider.responses(AI_MODEL),
      system:
        'You list the events shown in the text of a venue or "what\'s on" web page, as JSON. ' +
        'Copy title, date_text, time_text and venue EXACTLY as they appear in the text, character for character. ' +
        'Never reformat, complete, translate or guess. date_text is the date written next to that event ' +
        '(for example "Thu 4 Dec" or "4th December 2026"). Leave out any event that has no date written in the text. ' +
        'time_text and venue are null when not written. At most 60 events. If there are none, return an empty list.',
      prompt: `URL: ${url}\n\nPAGE TEXT:\n${pageText.slice(0, 24000)}`,
      output: Output.object({ schema: CandidateSchema }),
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: 'low',
          reasoningSummary: 'auto',
          include: ['reasoning.encrypted_content'],
          strictJsonSchema: true,
        },
      },
    });
    const output = await result.output;
    return (output?.events ?? []).slice(0, 60);
  } catch (e) {
    console.warn('Text fallback failed', e instanceof Error ? e.message : e);
    return [];
  }
}

// ---------- reading a page ----------

export interface ReadResult {
  events: WhatsOnEvent[];
  method: WhatsOnMethod | null;
  name: string;
  error?: string;
  candidates?: number;
}

async function readFeed(url: string, text: string, type: string, today: string): Promise<{ events: WhatsOnEvent[]; method: WhatsOnMethod } | null> {
  if (/text\/calendar/i.test(type) || /^\s*BEGIN:VCALENDAR/i.test(text)) {
    return { events: upcomingUnique(parseIcs(text, url), today, DAYS_AHEAD), method: 'ical' };
  }
  if (/json/i.test(type) || /^\s*[[{]/.test(text)) {
    try {
      return { events: upcomingUnique(parseJsonFeed(JSON.parse(text), url), today, DAYS_AHEAD), method: 'json' };
    } catch {
      return null;
    }
  }
  return null;
}

export async function readWhatsOn(url: string): Promise<ReadResult> {
  const today = londonToday();
  const fallbackName = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();

  if (!isPublicHttpUrl(url)) return { events: [], method: null, name: fallbackName, error: 'That address can’t be read.' };
  if (!(await allowedByRobots(url))) {
    return { events: [], method: null, name: fallbackName, error: 'This site asks automated readers not to visit that page, so we won’t read it.' };
  }

  let page;
  try {
    page = await fetchText(url, 'text/html,application/xhtml+xml,text/calendar,application/json;q=0.9,*/*;q=0.5');
  } catch {
    return { events: [], method: null, name: fallbackName, error: 'The page didn’t respond.' };
  }
  if (!page.ok) return { events: [], method: null, name: fallbackName, error: `The page returned an error (${page.status}).` };

  // The pasted URL might itself be a calendar feed
  const direct = await readFeed(page.finalUrl, page.text, page.type, today);
  if (direct) return { ...direct, name: fallbackName };

  const html = page.text;
  const name = pageName(html, page.finalUrl);

  // 1. schema.org/Event
  const ld = upcomingUnique(extractJsonLdEvents(html, page.finalUrl), today, DAYS_AHEAD);
  if (ld.length) return { events: ld, method: 'jsonld', name };

  // 2. iCal / JSON calendar feed advertised by the page
  for (const feedUrl of findCalendarFeedLinks(html, page.finalUrl)) {
    if (!isPublicHttpUrl(feedUrl) || !(await allowedByRobots(feedUrl))) continue;
    try {
      const feed = await fetchText(feedUrl, 'text/calendar,application/json;q=0.9,*/*;q=0.5');
      if (!feed.ok) continue;
      const parsed = await readFeed(feed.finalUrl, feed.text, feed.type, today);
      if (parsed?.events.length) return { ...parsed, name };
    } catch { /* try next */ }
  }

  // 3. plain-text fallback: keep only events whose date text is on the page
  const text = htmlToText(html);
  if (text.length < 80) return { events: [], method: null, name };
  const candidates = await textCandidates(text, page.finalUrl);
  const verified = verifyTextCandidates(candidates as never[], text, page.finalUrl, today, anchorLinks(html, page.finalUrl));
  const events = upcomingUnique(verified, today, DAYS_AHEAD);
  console.log(`text fallback ${page.finalUrl}: ${candidates.length} candidates, ${verified.length} verified, ${events.length} upcoming`);
  return { events, method: events.length ? 'text' : null, name, candidates: candidates.length };
}

