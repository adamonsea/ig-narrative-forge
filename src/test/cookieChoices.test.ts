import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
});

async function reader(country: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => `h=${location.hostname}\nloc=${country}` }));
  const consent = await import('@/lib/readerConsent');
  await consent.ensureReaderRegion();
  return consent;
}

describe('One-tap reader privacy choices', () => {
  it('Essential only stops UK reader counting and deletes the seven-day ID', async () => {
    const consent = await reader('GB');
    consent.markUkNoticeSeen();
    localStorage.setItem('curatr_rid', 'zztest_cookie_choices');
    consent.saveReaderChoices(false);
    expect(consent.currentReaderMode()).toBe('off');
    expect(localStorage.getItem('curatr_rid')).toBeNull();
    expect(JSON.parse(localStorage.getItem('cookie_consent_analytics') ?? '{}').choice).toBe('denied');
  });
  it('Accept all clears an earlier opt-out and permits full reader counting', async () => {
    const consent = await reader('GB');
    consent.saveReaderChoices(false);
    consent.saveReaderChoices(true);
    expect(consent.currentReaderMode()).toBe('full');
    expect(consent.isReaderOptedOut()).toBe(false);
    expect(JSON.parse(localStorage.getItem('cookie_consent_analytics') ?? '{}').choice).toBe('granted');
  });
  it('UK Customise keeps anonymous counts separate from analytics cookies', async () => {
    const consent = await reader('GB');
    consent.markUkNoticeSeen();
    consent.saveReaderChoices(false, true);
    expect(consent.currentReaderMode()).toBe('anonymous');
    const input = consent.readerConsentInput();
    if (!input) throw new Error('Region did not resolve');
    expect(consent.canLoadGoogleAnalytics(input)).toBe(false);
  });
  it('Essential only stops EU reader counting', async () => {
    const consent = await reader('PT');
    consent.saveReaderChoices(false);
    expect(consent.currentReaderMode()).toBe('off');
  });
  it('Global Privacy Control wins over Accept all', async () => {
    const consent = await reader('GB');
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    consent.saveReaderChoices(true);
    expect(consent.currentReaderMode()).toBe('off');
  });
});