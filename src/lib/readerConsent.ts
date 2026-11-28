/**
 * Reader counting by region (one rule for every tracker and Google Analytics).
 * - UK: anonymous, aggregate counts by default (statistics exemption), with a notice and a simple opt-out.
 *   A random ID is kept for 7 days so returning readers can be counted; opting out deletes it.
 *   Accepting analytics upgrades to full counting (stored ID, Google Analytics).
 * - EU/EEA, Switzerland, Canada, crown dependencies and unknown locations: counted per visit only, with
 *   nothing stored on the device, until they answer; Accept = full counting, Reject = nothing.
 * - Elsewhere: counted unless the reader opts out.
 * - Global Privacy Control: never counted.
 * Location comes only from this site's own /cdn-cgi/trace (no third-party lookup).
 */
import { readChoice, saveChoices, onConsentChange, type Choice } from './consent';

/** full = stored ID (+ GA); anonymous = UK 7-day random ID; visit = this page load only, nothing stored; off = nothing. */
export type ReaderMode = 'full' | 'anonymous' | 'visit' | 'off';
export type ReaderRegion = 'uk' | 'consent' | 'open';
export type ReaderBanner = 'none' | 'uk-notice' | 'consent';

const CONSENT_COUNTRIES = new Set(
  'AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE,IS,LI,NO,CH,RE,GP,MQ,GF,YT,MF,AX,CA,IM,JE,GG'.split(','),
);

export function regionFor(country: string | null | undefined): ReaderRegion {
  if (!country || country === 'XX' || country === 'T1') return 'consent';
  if (country === 'GB') return 'uk';
  return CONSENT_COUNTRIES.has(country) ? 'consent' : 'open';
}

export interface ReaderConsentInput {
  country: string | null;
  /** The reader's analytics answer (full counting + Google Analytics). */
  choice: Choice | null;
  /** UK only: the anonymous-counting notice has been shown. */
  ukNoticeSeen: boolean;
  /** The reader opted out of counting. */
  optedOut: boolean;
  gpc: boolean;
}

/** Pure rule, covered by tests. */
export function readerTrackingMode(i: ReaderConsentInput): ReaderMode {
  if (i.gpc) return 'off';
  const region = regionFor(i.country);
  if (region === 'consent') return i.choice === 'granted' ? 'full' : i.choice === 'denied' ? 'off' : 'visit';
  if (i.optedOut) return 'off';
  if (i.choice === 'granted') return 'full';
  if (region === 'uk') {
    // An earlier "Essential only" is respected until the new notice has been shown.
    if (i.choice === 'denied') return i.ukNoticeSeen ? 'anonymous' : 'off';
    return 'anonymous';
  }
  return i.choice === 'denied' ? 'off' : 'full';
}

/** Google Analytics shares data with Google, so it runs only with full counting. */
export const canLoadGoogleAnalytics = (i: ReaderConsentInput): boolean => readerTrackingMode(i) === 'full';

/** Which banner (if any) the reader should see. Pure, covered by tests. */
export function readerBanner(i: ReaderConsentInput): ReaderBanner {
  if (i.gpc) return 'none';
  const region = regionFor(i.country);
  if (region === 'consent') return i.choice === null ? 'consent' : 'none';
  if (region === 'uk') return !i.ukNoticeSeen && !i.optedOut && i.choice !== 'granted' ? 'uk-notice' : 'none';
  return 'none';
}

// ---------- Browser state ----------
const OPT_OUT_KEY = 'curatr_reader_optout';
const NOTICE_KEY = 'curatr_reader_notice';
const CHANGE_EVENT = 'reader-consent-change';

let country: string | null | undefined; // undefined = not looked up yet
let lookup: Promise<void> | undefined;

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

/** One-time copy of the old single answer ({ analytics: boolean }) into the per-purpose answer. */
export function migrateLegacyConsent(): void {
  if (!isBrowser()) return;
  try {
    if (localStorage.getItem('cookie_consent_analytics') !== null) return;
    const old = JSON.parse(localStorage.getItem('cookie_consent') ?? 'null');
    if (typeof old?.analytics !== 'boolean') return;
    const at = typeof old.timestamp === 'number' ? old.timestamp : Date.now();
    localStorage.setItem('cookie_consent_analytics', JSON.stringify({ choice: old.analytics ? 'granted' : 'denied', at }));
  } catch { /* storage blocked */ }
}

async function lookupCountry(): Promise<string | null> {
  try {
    const res = await fetch('/cdn-cgi/trace', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const trace = await res.text();
    const host = trace.match(/^h=(.+)$/m)?.[1]?.trim().toLowerCase().replace(/:\d+$/, '');
    if (host !== location.hostname) return null;
    return trace.match(/^loc=([A-Z0-9]{2})$/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function ensureReaderRegion(): Promise<void> {
  if (!isBrowser()) return Promise.resolve();
  return (lookup ??= (migrateLegacyConsent(), lookupCountry()).then((c) => {
    country = c;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }));
}

const flag = (key: string): boolean => {
  try { return localStorage.getItem(key) !== null; } catch { return false; }
};

const gpcOn = (): boolean =>
  typeof navigator !== 'undefined' && (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

export function readerConsentInput(): ReaderConsentInput | null {
  if (!isBrowser()) return null;
  if (country === undefined) { void ensureReaderRegion(); return null; }
  return {
    country,
    choice: readChoice('analytics'),
    ukNoticeSeen: flag(NOTICE_KEY),
    optedOut: flag(OPT_OUT_KEY),
    gpc: gpcOn(),
  };
}

/** Null until the region is known (trackers treat that as "not yet"). */
export function currentReaderMode(): ReaderMode | null {
  const i = readerConsentInput();
  return i ? readerTrackingMode(i) : null;
}

export async function whenReaderMode(): Promise<ReaderMode> {
  await ensureReaderRegion();
  return currentReaderMode() ?? 'off';
}

export const readerCountry = (): string | null => country ?? null;
export const readerRegion = (): ReaderRegion | null => (country === undefined ? null : regionFor(country));

/** Recorded when the UK notice is displayed. Deliberately silent so the notice stays on screen. */
export function markUkNoticeSeen(): void {
  try { if (!flag(NOTICE_KEY)) localStorage.setItem(NOTICE_KEY, String(Date.now())); } catch { /* ignore */ }
}

export const isReaderOptedOut = (): boolean => flag(OPT_OUT_KEY);

export function setReaderOptOut(optedOut: boolean): void {
  try {
    // Opting out also deletes the UK 7-day reader ID (key kept here to avoid a circular import).
    if (optedOut) { localStorage.setItem(OPT_OUT_KEY, String(Date.now())); localStorage.removeItem('curatr_rid'); }
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveAnalyticsChoice(choice: Choice): void {
  saveChoices({ analytics: choice });
}

/** One-tap choices also update the separate UK anonymous-counting opt-out. */
export function saveReaderChoices(analytics: boolean, anonymous = analytics): void {
  setReaderOptOut(!anonymous && !analytics);
  saveAnalyticsChoice(analytics ? 'granted' : 'denied');
}

/** Fires on any change to the reader's choices (this tab or others) and when the region resolves. */
export function onReaderConsentChange(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === OPT_OUT_KEY || e.key === NOTICE_KEY) listener(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  const offConsent = onConsentChange(listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
    offConsent();
  };
}
