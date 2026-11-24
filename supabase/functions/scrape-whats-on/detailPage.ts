/**
 * Full descriptions from an event's own page, when the listing cuts them off ("…").
 * Used only on feeds with captions on. Same-site pages only, robots.txt respected,
 * and the page text must begin like the listing's own excerpt, so it is the same event's
 * wording, copied — never rewritten.
 */
import { decodeEntities, normaliseForMatch } from './extract.ts';
import { allowedByRobots, isPublicHttpUrl } from './read.ts';

const MAX_PAGES = 80;
const CONCURRENCY = 6;
const MAX_CHARS = 2000;

export const cutOff = (d: string | null | undefined) => /(\.\.\.|…)\s*$/.test((d ?? '').trim());

const text = (h: string) => decodeEntities(h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The event body's paragraphs (WordPress entry container), before credits/extra info. */
export function fullDescriptionFrom(html: string, excerpt: string): string | null {
  const start = html.search(/class=["']?(entry-container|entry-content)\b/i);
  if (start < 0) return null;
  let body = html.slice(start, start + 60_000);
  const stop = body.search(/class=["']?(event__extra-info|event__credits|section-title--venue|post__share)\b/i);
  if (stop > 0) body = body.slice(0, stop);
  const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => text(m[1])).filter((p) => p.length > 1);
  if (!paras.length) return null;
  let out = '';
  for (const p of paras) {
    if ((out ? out.length + 2 : 0) + p.length > MAX_CHARS) break;
    out = out ? `${out}\n\n${p}` : p;
  }
  if (!out) return null;
  // Same event: the page must start the way the listing's excerpt does
  const head = normaliseForMatch(excerpt.replace(/(\.\.\.|…)\s*$/, '')).slice(0, 60);
  return head && normaliseForMatch(out).startsWith(head) ? out : null;
}

/** url → full description, for listings whose excerpt was cut off. */
export async function fetchFullDescriptions(items: { url: string; excerpt: string }[], siteUrl: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let host: string;
  try { host = new URL(siteUrl).hostname.replace(/^www\./, ''); } catch { return out; }
  const todo = items.filter((i) => {
    try { return isPublicHttpUrl(i.url) && new URL(i.url).hostname.replace(/^www\./, '') === host; } catch { return false; }
  }).slice(0, MAX_PAGES);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const item = todo[next++]!;
      try {
        if (!(await allowedByRobots(item.url))) continue;
        const r = await fetch(item.url, { redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CuratrEvents/1.0; +https://curatr.pro)', Accept: 'text/html' } });
        if (!r.ok) { await r.body?.cancel(); continue; }
        const full = fullDescriptionFrom((await r.text()).slice(0, 1_500_000), item.excerpt);
        if (full) out.set(item.url, full);
      } catch { /* keep the excerpt */ }
    }
  }));
  return out;
}
