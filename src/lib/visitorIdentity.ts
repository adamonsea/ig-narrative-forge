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

// UK anonymous counting: a random ID kept for 7 days from first use so returning readers can be counted,
// then replaced. Never linked to anything else; opting out deletes it.
export const UK_ID_KEY = 'curatr_rid';
export const UK_ID_DAYS = 7;
const DAY_MS = 86_400_000;

/** Pure: the stored UK ID if it is still within its 7 days, else null. */
export function liveUkId(raw: string | null, now: number): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (typeof v.id !== 'string' || !/^[a-z0-9]{8,32}$/.test(v.id) || typeof v.at !== 'number') return null;
    return now - v.at < UK_ID_DAYS * DAY_MS && now >= v.at ? v.id : null;
  } catch {
    return null;
  }
}

let ukFallback: string | null = null;
const getUkVisitorId = (prefix: string): string => {
  let id: string | null = null;
  try {
    id = liveUkId(localStorage.getItem(UK_ID_KEY), Date.now());
    if (!id) {
      id = randomId();
      localStorage.setItem(UK_ID_KEY, JSON.stringify({ id, at: Date.now() }));
    }
  } catch {
    id = ukFallback ??= randomId();
  }
  return `${prefix}_anon_${id}`;
};

/** Removes the UK 7-day ID (opt-out, or counting switched off). */
export function clearUkVisitorId(): void {
  try { localStorage.removeItem(UK_ID_KEY); } catch { /* ignore */ }
}

// Per-visit counting (EU before an answer): one random ID in memory for this page load, never stored.
let visitId: string | null = null;
export const getAnonymousVisitorId = (prefix = 'v'): string => `${prefix}_once_${(visitId ??= randomId())}`;

/** Tracker ID for the reader's mode: stored ID (full), UK 7-day ID (anonymous), or this page load only (visit). */
export const getVisitorId = (prefix = 'v'): string => {
  const mode = currentReaderMode();
  if (mode === 'full') return getStoredVisitorId(prefix);
  if (mode === 'anonymous') return getUkVisitorId(prefix);
  return getAnonymousVisitorId(prefix);
};

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
