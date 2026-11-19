import { tidyPrice } from './currency.ts';

/**
 * Event categories — one rule set for the gatherer (scrape-whats-on) and the app
 * (re-exported from src/lib/eventCategories.ts). Rules only; unplaced events get one
 * background model check after saving (scrape-whats-on/categoryCheck.ts).
 * Keys match EventCategoryIcon. Starting ten for every feed; Comedy and Workshops
 * are spare and arrive through suggestions; "other" catches the rest.
 */
export const STARTING_EVENT_CATEGORIES = [
  'music', 'family', 'sport', 'food-drink', 'arts-theatre', 'film', 'talks', 'nightlife', 'outdoors', 'markets',
] as const;
export const SPARE_EVENT_CATEGORIES = ['comedy', 'workshops'] as const;
export const ALL_EVENT_CATEGORIES = [...STARTING_EVENT_CATEGORIES, ...SPARE_EVENT_CATEGORIES, 'other'] as const;
export type EventCategoryKey = typeof ALL_EVENT_CATEGORIES[number];

// Keyword rules (English + common Portuguese listing words). Order matters: first match wins.
const RULES: [EventCategoryKey, RegExp][] = [
  ['comedy', /\b(comedy|comedian|stand[- ]?up|com[eé]dia|humor|improv)\b/i],
  ['workshops', /\b(workshop|masterclass|class(es)?|course|oficina|atelier|hands[- ]on)\b/i],
  ['film', /\b(film|films|cinema|movie|screening|documentary|cinemateca|filme|curtas?)\b/i],
  ['family', /\b(kids|children|family|families|toddler|infantil|crian[cç]as|fam[ií]lia|pantomime|panto)\b/i],
  ['markets', /\b(market|markets|fair|feira|mercado|car boot|flea|craft fair|bazaar)\b/i],
  ['food-drink', /\b(food|wine|beer|tasting|supper|brunch|dinner|gin|cocktail|gastronom\w*|vinho|cerveja|degusta\w*|street food)\b/i],
  ['sport', /\b(football|futebol|match|marathon|run|race|cycling|tennis|rugby|cricket|golf|surf|yoga|fitness|basketball|volleyball|sports?)\b/i],
  ['outdoors', /\b(walk|walks|hike|hiking|trail|garden|gardens|park|beach|nature|tour|passeio|caminhada|outdoor)\b/i],
  ['talks', /\b(talk|talks|lecture|conference|debate|panel|book launch|reading|confer[eê]ncia|palestra|semin[aá]rio|q&a)\b/i],
  ['nightlife', /\b(club night|dj|djs|party|rave|techno|house music|after ?party|festa|clubbing)\b/i],
  ['music', /\b(concert|gig|live music|band|orchestra|symphony|choir|jazz|fado|recital|quartet|opera|festival of music|concerto|m[uú]sica|tour|album|acoustic|rock|folk|blues|soul|hip[- ]hop|piano|guitar)\b/i],
  ['arts-theatre', /\b(theatre|theater|play|musical|ballet|dance|exhibition|gallery|museum|art|arts|opera|teatro|exposi[cç][aã]o|dan[cç]a|performance|circus|panto)\b/i],
];

// What listing sites and schema.org call things
const HINTS: [EventCategoryKey, RegExp][] = [
  ['music', /music|concert|musicevent|m[uú]sica|concerto/i],
  ['comedy', /comedy|com[eé]dia|humou?r/i],
  ['film', /film|cinema|screening|screeningevent|cinema/i],
  ['family', /child|family|kids|infantil|crian/i],
  ['sport', /sport|desporto/i],
  ['food-drink', /food|drink|gastronom|foodevent|wine/i],
  ['talks', /talk|lecture|conference|education|literary|confer[eê]ncia|educationevent|pensamento|literatura/i],
  ['nightlife', /night|club|party|festa/i],
  ['outdoors', /outdoor|nature|walk|tour|ar livre/i],
  ['markets', /market|fair|feira|mercado|saleevent/i],
  ['workshops', /workshop|course|class|oficina|courseinstance/i],
  ['arts-theatre', /theat|art|exhibition|dance|visualartsevent|exhibitionevent|danceevent|teatro|exposi|dan[cç]a|artes/i],
];

const BROAD_HINT = /^\s*(arts?|artes|culture|cultura|entertainment|lazer)(\s|$)/i;

/** A listing site's own label or schema.org @type → our key, or null when it says nothing useful. */
export function categoryFromHint(hint: string | null | undefined): EventCategoryKey | null {
  if (!hint) return null;
  const h = hint.trim();
  if (!h || /^(event|events|other|outros?|geral|general)$/i.test(h)) return null;
  for (const [key, re] of HINTS) if (re.test(h)) return key;
  return null;
}

/** Rules only: the listing's own category first, then keywords in title, description, venue. */
export function categorizeEvent(
  e: { title: string; description?: string | null; venue?: string | null; hint?: string | null },
  /** Spare categories this feed has added (Comedy, Workshops …); others stay out until suggested. */
  added: readonly string[] = [],
): EventCategoryKey {
  const usable = (k: EventCategoryKey | null) => k && (!(SPARE_EVENT_CATEGORIES as readonly string[]).includes(k) || added.includes(k)) ? k : null;
  const fromHint = usable(categoryFromHint(e.hint));
  let fromWords: EventCategoryKey = 'other';
  outer: for (const text of [e.title, e.description ?? '', e.venue ?? '']) {
    for (const [key, re] of RULES) if (text && re.test(text) && usable(key)) { fromWords = key; break outer; }
  }
  // Listing sites often file everything under a broad "arts"/"culture" label: words beat that
  if (fromHint && !(fromHint === 'arts-theatre' && BROAD_HINT.test(e.hint ?? '') && fromWords !== 'other')) return fromHint;
  return fromWords;
}

/** Spare categories need this many "Other" events in 30 days before we suggest them. */
export const SUGGEST_AFTER = 8;

/** Which spare category the feed's "Other" events point to, if 8+ match. Rules only. */
export function suggestEventCategory(
  others: { title: string; description?: string | null; venue?: string | null }[],
  offered: string[],
): { category: EventCategoryKey; count: number; ids?: never } | null {
  let best: { category: EventCategoryKey; count: number } | null = null;
  for (const key of SPARE_EVENT_CATEGORIES) {
    if (offered.includes(key)) continue;
    const rule = RULES.find(([k]) => k === key)![1];
    const count = others.filter((e) => rule.test(`${e.title} ${e.description ?? ''}`)).length;
    if (count >= SUGGEST_AFTER && (!best || count > best.count)) best = { category: key, count };
  }
  return best;
}

/** Ids of the "Other" events a suggestion would re-tag. */
export function eventsMatching<T extends { title: string; description?: string | null }>(others: T[], key: EventCategoryKey): T[] {
  const rule = RULES.find(([k]) => k === key)?.[1];
  return rule ? others.filter((e) => rule.test(`${e.title} ${e.description ?? ''}`)) : [];
}

/** Short reader description: plain text, boilerplate dropped, ~240 chars at a word boundary. */
export function shortDescription(raw: string | null | undefined, max = 240): string | null {
  if (!raw) return null;
  let t = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(buy|book) (your )?tickets?( now)?\b.*$/i, '').replace(/\bclick here\b.*$/i, '').trim();
  if (t.length < 12) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[,;:\-–]$/, '')}…`;
}

/** Price facts from schema.org offers / listing fields. Never guessed: null when the source doesn't say. */
export function priceFacts(offers: unknown, freeFlag?: unknown, costText?: unknown): { price: string | null; is_free: boolean | null } {
  if (freeFlag === true || freeFlag === 'true') return { price: null, is_free: true };
  if (typeof costText === 'string' && costText.trim()) {
    const tidy = tidyPrice(costText);
    if (tidy.price || tidy.is_free) return tidy;
  }
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const p = r['price'] ?? r['lowPrice'];
    const num = typeof p === 'number' ? p : typeof p === 'string' ? Number(p.replace(',', '.')) : NaN;
    if (Number.isFinite(num)) {
      if (num === 0) return { price: null, is_free: true };
      const cur = String(r['priceCurrency'] ?? '').toUpperCase();
      const sym = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'USD' ? '$' : '';
      const n = Number.isInteger(num) ? String(num) : num.toFixed(2);
      return { price: sym ? `${r['lowPrice'] != null && r['price'] == null ? 'From ' : ''}${sym}${n}` : `${n}${cur ? ` ${cur}` : ''}`, is_free: false };
    }
  }
  return { price: null, is_free: null };
}
