/** whats_on_page — a venue or listings page (JSON-LD → iCal/JSON feed → verified text). */
import type { EventReader, ReaderResult } from './types.ts';
import { normaliseForMatch } from '../extract.ts';
import { readWhatsOn } from '../read.ts';

async function sha1(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

export const whatsOnPageReader: EventReader = {
  kind: 'whats_on_page',
  sourceApi: 'whats_on',
  externalId: (sourceId, key) => `${sourceId}:${key}`,
  detect: () => Promise.resolve(true), // the catch-all reader

  async read(url): Promise<ReaderResult> {
    const r = await readWhatsOn(url);
    const events = await Promise.all(r.events.map(async (e) => ({
      key: await sha1(`${normaliseForMatch(e.title)}|${e.start_date}|${e.start_time ?? ''}`),
      title: e.title,
      start_date: e.start_date,
      start_time: e.start_time,
      venue: e.venue,
      url: e.url,
      place: e.place ?? null,
      online: e.online ?? false,
    })));
    return { events, method: r.method, name: r.name, error: r.error ?? null };
  },
};
