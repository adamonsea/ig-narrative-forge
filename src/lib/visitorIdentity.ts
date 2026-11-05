// Stable, lightweight visitor identity + bot detection shared by all trackers.
const KEY = 'curatr_vid';

export const isLikelyBot = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  if ((navigator as any).webdriver) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|python|curl|wget|axios|node-fetch|phantom|puppeteer|playwright/i.test(
    navigator.userAgent
  );
};

export const getVisitorId = (prefix = 'v'): string => {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16);
      localStorage.setItem(KEY, id);
    }
  } catch {
    id = Math.random().toString(36).slice(2, 14);
  }
  return `${prefix}_${id}`;
};

const COUNTRY_KEY = 'curatr_cc';
/** Returns cached country instantly; refreshes in background for next visit. Never blocks tracking. */
export const getCachedCountry = (): string | null => {
  let cc: string | null = null;
  try { cc = localStorage.getItem(COUNTRY_KEY); } catch { /* ignore */ }
  if (!cc) {
    fetch('https://ipapi.co/country/', { signal: AbortSignal.timeout(3000) })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => { const v = t.trim(); if (/^[A-Z]{2}$/.test(v)) localStorage.setItem(COUNTRY_KEY, v); })
      .catch(() => {});
  }
  return cc;
};
