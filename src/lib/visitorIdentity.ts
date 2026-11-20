// Stable, lightweight visitor identity + bot detection shared by all trackers.
// Whether and how a reader is counted is decided only by src/lib/readerConsent.ts.
import { currentReaderMode, whenReaderMode, readerCountry, onReaderConsentChange } from './readerConsent';
import { onHumanSignal } from './humanSignal';

const KEY = 'curatr_vid';

export const isLikelyBot = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  if ((navigator as any).webdriver) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|python|curl|wget|axios|node-fetch|phantom|puppeteer|playwright/i.test(
    navigator.userAgent
  );
};

const randomId = (): string =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16);

/** The ID kept on the device. Only for full counting and for features the reader uses (reactions). */
export const getStoredVisitorId = (prefix = 'v'): string => {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
  } catch {
    id = Math.random().toString(36).slice(2, 14);
  }
  return `${prefix}_${id}`;
};

// Anonymous counting: one random ID held in memory for this page load only, never written to the device.
let anonymousId: string | null = null;
export const getAnonymousVisitorId = (prefix = 'v'): string => `${prefix}_anon_${(anonymousId ??= randomId())}`;

/** Tracker ID: the stored ID only with full counting, otherwise the in-memory anonymous ID. */
export const getVisitorId = (prefix = 'v'): string =>
  currentReaderMode() === 'full' ? getStoredVisitorId(prefix) : getAnonymousVisitorId(prefix);

/** Visitor's country from this site's own lookup (no third-party call). Null until known. */
export const getCachedCountry = (): string | null => readerCountry();

/** Single gate for every reader tracker: not a bot and counting allowed for this reader. */
export const canTrackReader = (): boolean => {
  if (isLikelyBot()) return false;
  const mode = currentReaderMode();
  return mode !== null && mode !== 'off';
};

/**
 * Runs cb once a real person has interacted and counting is allowed for this reader. If counting is
 * not allowed yet (e.g. the reader taps Accept after their first touch), it waits for that change.
 */
export function onReaderTrackable(cb: () => void): () => void {
  let cancelled = false;
  let offChange: () => void = () => {};
  const attempt = (): boolean => {
    if (cancelled || !canTrackReader()) return false;
    cancelled = true;
    offChange();
    cb();
    return true;
  };
  const unsubscribe = onHumanSignal(() => {
    void whenReaderMode().then(() => {
      if (attempt() || cancelled || typeof window === 'undefined') return;
      offChange = onReaderConsentChange(() => { attempt(); });
    });
  });
  return () => { cancelled = true; unsubscribe(); offChange(); };
}
