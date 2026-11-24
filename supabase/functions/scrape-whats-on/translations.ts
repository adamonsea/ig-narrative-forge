/**
 * A listings site published in two languages (Agenda LX: Portuguese posts, a separate
 * English edition with its own post ids). Pure rules, no network.
 *
 * The page's own language leads (official titles). An English listing is the same event
 * only on a strict match — the very same picture address and the same venue or last day —
 * and then gives the English title as a copied fact. English listings that clearly repeat
 * a page-language one (same venue, same first and last day, same picture file) are dropped;
 * the rest are kept as their own events so nothing the site lists is lost.
 */
import type { WhatsOnEvent } from './extract.ts';
import { normaliseForMatch } from './extract.ts';

/** True when the page is in a language other than English (its English edition is then tried). */
export function englishEdition(html: string): boolean {
  const lang = html.match(/<html\b[^>]*\blang=["']?([a-z]{2})/i)?.[1]?.toLowerCase();
  if (!lang || lang === 'en') return false;
  // Some servers drop the language links for non-browser readers; the English list is then
  // only used if it really is a separate edition (its own ids, see read.ts)
  return true;
}

const file = (u: string | null | undefined) => (u ?? '').split('/').pop()?.toLowerCase().replace(/\.(jpe?g|png|webp|gif|avif)$/, '').replace(/-(\d+x\d+|scaled|\d)$/, '') || null;
const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && normaliseForMatch(a) === normaliseForMatch(b));

export function mergeEnglishEdition(main: WhatsOnEvent[], english: WhatsOnEvent[]): { events: WhatsOnEvent[]; matched: number; dropped: number; kept: number } {
  const out = main.map((e) => ({ ...e }));
  let matched = 0, dropped = 0, kept = 0;
  const used = new Set<number>();
  for (const en of english) {
    const hits = out.map((m, i) => ({ m, i })).filter(({ m, i }) => !used.has(i) && en.image && m.image === en.image && (same(m.venue, en.venue) || (m.end_date ?? null) === (en.end_date ?? null)));
    if (hits.length === 1) {
      const { m, i } = hits[0]!;
      used.add(i);
      matched++;
      if (!same(m.title, en.title)) m.alt_title = en.title;
      m.alt_url = en.url;
      continue;
    }
    const repeat = out.some((m) => same(m.venue, en.venue) && m.start_date === en.start_date && (m.end_date ?? null) === (en.end_date ?? null) && file(m.image) && file(m.image) === file(en.image));
    if (repeat) { dropped++; continue; }
    out.push({ ...en, alt_url: en.url });
    kept++;
  }
  return { events: out, matched, dropped, kept };
}
