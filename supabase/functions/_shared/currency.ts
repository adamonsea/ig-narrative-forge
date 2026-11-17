/**
 * Event prices in the feed's own currency — one rule set for the gatherer and the app
 * (re-exported from src/lib/currency.ts). A feed's currency is the owner's choice;
 * until they pick one, the gatherer sets it from the country of its sources' web
 * addresses (.pt → €, .co.uk → £), else £. Prices are never guessed: no price, no line.
 */
export type FeedCurrency = 'GBP' | 'EUR' | 'USD';
export const FEED_CURRENCIES: FeedCurrency[] = ['GBP', 'EUR', 'USD'];
export const CURRENCY_SYMBOL: Record<FeedCurrency, string> = { GBP: '£', EUR: '€', USD: '$' };

const EURO_TLDS = new Set(['pt', 'es', 'fr', 'de', 'it', 'ie', 'nl', 'be', 'at', 'fi', 'gr', 'lu', 'sk', 'si', 'ee', 'lv', 'lt', 'mt', 'cy', 'hr', 'eu']);

export function isFeedCurrency(v: unknown): v is FeedCurrency {
  return typeof v === 'string' && (FEED_CURRENCIES as string[]).includes(v);
}

/** The currency the first country-coded web address points to; null when none does (.com, .org …). */
export function currencyFromUrls(urls: (string | null | undefined)[]): FeedCurrency | null {
  for (const raw of urls) {
    if (!raw) continue;
    let host = '';
    try { host = new URL(raw).hostname.toLowerCase(); } catch { continue; }
    const tld = host.split('.').pop() ?? '';
    if (tld === 'uk') return 'GBP';
    if (EURO_TLDS.has(tld)) return 'EUR';
    if (tld === 'us') return 'USD';
  }
  return null;
}

/** The currency a feed uses: its own setting, else from its sources, else £. */
export function feedCurrency(saved: unknown, sourceUrls: (string | null | undefined)[] = []): FeedCurrency {
  return isFeedCurrency(saved) ? saved : currencyFromUrls(sourceUrls) ?? 'GBP';
}

const NUM = /\d+(?:[.,]\d{1,2})?/g;
const tidyNum = (n: string) => {
  const v = Number(n.replace(',', '.'));
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

/**
 * A listing's own price text, tidied for storage. Pure amounts lose their wording
 * ("15 € to 20" → "€15–20", "4" → "4") so the feed can add its currency; anything
 * else ("Pay what you can") is kept as written. "0" → free. Null when empty.
 */
export function tidyPrice(raw: string | null | undefined): { price: string | null; is_free: boolean | null } {
  const t = (raw ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { price: null, is_free: null };
  if (/^(free|gr[aá]tis|gratuito|entrada (livre|gratuita))$/i.test(t)) return { price: null, is_free: true };
  const rest = t.replace(NUM, '').replace(/[€£$]|\b(eur|euros?|gbp|usd|to|a|até|from|desde)\b|[\s\-–—.,/]/gi, '');
  const nums = t.match(NUM) ?? [];
  if (!rest && nums.length >= 1 && nums.length <= 2) {
    const [a, b] = nums.map(tidyNum);
    if (Number(a) === 0 && (b === undefined || Number(b) === 0)) return { price: null, is_free: true };
    const sym = t.match(/[€£$]/)?.[0] ?? (/\beur(os?)?\b/i.test(t) ? '€' : /\bgbp\b/i.test(t) ? '£' : /\busd\b/i.test(t) ? '$' : '');
    const lead = /\b(from|desde)\b/i.test(t) && b === undefined ? 'From ' : '';
    return { price: `${lead}${sym}${b !== undefined && b !== a ? `${a}–${b}` : a}`, is_free: false };
  }
  return { price: t.slice(0, 40), is_free: false };
}

/**
 * The price line readers see: "Free", "€12", "€15–20", or the listing's own words.
 * A bare amount needs the feed's currency; without one it stays hidden.
 */
export function formatPrice(price: string | null | undefined, isFree: boolean | null | undefined, currency: unknown): string | null {
  if (isFree === true) return 'Free';
  const p = price?.trim();
  if (!p) return null;
  const m = p.match(/^(From )?(\d+(?:\.\d{1,2})?(?:–\d+(?:\.\d{1,2})?)?)$/);
  if (!m) return p;
  return isFeedCurrency(currency) ? `${m[1] ?? ''}${CURRENCY_SYMBOL[currency]}${m[2]}` : null;
}
