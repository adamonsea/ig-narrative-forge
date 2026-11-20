// run with: bun test ./src/lib/readerConsent.test.ts
import { describe, it, expect } from 'bun:test';
import { readerTrackingMode, readerBanner, canLoadGoogleAnalytics, regionFor, type ReaderConsentInput } from './readerConsent';

const base: ReaderConsentInput = { country: 'GB', choice: null, ukNoticeSeen: false, optedOut: false, gpc: false };
const mode = (o: Partial<ReaderConsentInput>) => readerTrackingMode({ ...base, ...o });

describe('UK readers: anonymous statistics with notice and opt-out', () => {
  it('no answer is counted anonymously', () => expect(mode({})).toBe('anonymous'));
  it('opting out switches counting off', () => expect(mode({ optedOut: true })).toBe('off'));
  it('an earlier "Essential only" stays off until the new notice has been shown', () => {
    expect(mode({ choice: 'denied' })).toBe('off');
    expect(mode({ choice: 'denied', ukNoticeSeen: true })).toBe('anonymous');
  });
  it('accepting gives full counting', () => expect(mode({ choice: 'granted' })).toBe('full'));
  it('opting out wins over an earlier accept', () => expect(mode({ choice: 'granted', optedOut: true })).toBe('off'));
  it('Google Analytics does not load on the anonymous default', () => {
    expect(canLoadGoogleAnalytics({ ...base })).toBe(false);
    expect(canLoadGoogleAnalytics({ ...base, choice: 'granted' })).toBe(true);
  });
  it('shows the notice once, never after opt-out or accept', () => {
    expect(readerBanner(base)).toBe('uk-notice');
    expect(readerBanner({ ...base, ukNoticeSeen: true })).toBe('none');
    expect(readerBanner({ ...base, optedOut: true })).toBe('none');
    expect(readerBanner({ ...base, choice: 'granted' })).toBe('none');
  });
});

describe('EU readers: consent only', () => {
  it('no answer is not counted', () => expect(mode({ country: 'PT' })).toBe('off'));
  it('accept gives full counting', () => expect(mode({ country: 'PT', choice: 'granted' })).toBe('full'));
  it('reject is not counted', () => expect(mode({ country: 'DE', choice: 'denied', ukNoticeSeen: true })).toBe('off'));
  it('Google Analytics needs accept', () => expect(canLoadGoogleAnalytics({ ...base, country: 'FR' })).toBe(false));
  it('asks until answered', () => {
    expect(readerBanner({ ...base, country: 'PT' })).toBe('consent');
    expect(readerBanner({ ...base, country: 'PT', choice: 'denied' })).toBe('none');
  });
});

describe('unknown location, crown dependencies and the rest of the world', () => {
  it('unknown location is treated as consent-only', () => {
    expect(mode({ country: null })).toBe('off');
    expect(mode({ country: 'XX' })).toBe('off');
    expect(mode({ country: 'T1' })).toBe('off');
  });
  it('Jersey, Guernsey and the Isle of Man are consent-only', () => {
    for (const c of ['JE', 'GG', 'IM']) expect(regionFor(c)).toBe('consent');
  });
  it('US readers with no answer are counted as before', () => expect(mode({ country: 'US' })).toBe('full'));
  it('US readers who opt out are not counted', () => {
    expect(mode({ country: 'US', choice: 'denied' })).toBe('off');
    expect(mode({ country: 'US', optedOut: true })).toBe('off');
  });
});

describe('Global Privacy Control', () => {
  it('is never counted, anywhere, even after accept', () => {
    for (const country of ['GB', 'PT', 'US', null]) {
      expect(mode({ country, gpc: true, choice: 'granted' })).toBe('off');
      expect(readerBanner({ ...base, country, gpc: true })).toBe('none');
    }
  });
});
