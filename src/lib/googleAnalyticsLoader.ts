/**
 * Google Analytics loads only when the reader has full counting (see readerConsent.ts):
 * after Accept in the UK and EU, by default elsewhere. Never for bots or Global Privacy Control.
 * The Consent Mode defaults script in __root.tsx defines window.gtag/dataLayer before this runs.
 */
import { whenReaderMode, currentReaderMode } from './readerConsent';
import { isLikelyBot } from './visitorIdentity';

const GA_ID = 'G-C9VCW1ZPGR';
let loaded = false;
let scheduled = false;

export const isGoogleAnalyticsLoaded = (): boolean => loaded;

function inject() {
  // A reader may withdraw while the delayed download is waiting.
  if (currentReaderMode() !== 'full') { scheduled = false; return; }
  if (loaded || document.visibilityState !== 'visible') return;
  loaded = true;
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  gtag?.('js', new Date());
  gtag?.('config', GA_ID);
}

export function loadGoogleAnalyticsIfAllowed(): void {
  if (typeof window === 'undefined' || loaded || scheduled || isLikelyBot()) return;
  void whenReaderMode().then((mode) => {
    if (mode !== 'full' || loaded || scheduled) return;
    scheduled = true;
    const tryLoad = () => setTimeout(inject, 1500);
    tryLoad();
    document.addEventListener('visibilitychange', tryLoad);
  });
}
