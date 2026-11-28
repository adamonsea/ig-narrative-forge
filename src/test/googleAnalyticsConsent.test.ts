import { afterEach, expect, it, vi } from 'vitest';

const reader = vi.hoisted(() => ({ mode: 'full', whenReaderMode: vi.fn() }));
vi.mock('@/lib/readerConsent', () => ({ whenReaderMode: reader.whenReaderMode, currentReaderMode: () => reader.mode }));
vi.mock('@/lib/visitorIdentity', () => ({ isLikelyBot: () => false }));

afterEach(() => { vi.useRealTimers(); vi.resetModules(); document.head.querySelectorAll('script').forEach(el => el.remove()); });

it('withdrawing before the delayed analytics download prevents the tag loading', async () => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  reader.mode = 'full';
  reader.whenReaderMode.mockResolvedValue('full');
  const loader = await import('@/lib/googleAnalyticsLoader');
  loader.loadGoogleAnalyticsIfAllowed();
  await vi.advanceTimersByTimeAsync(500);
  reader.mode = 'off';
  await vi.advanceTimersByTimeAsync(1500);
  expect(loader.isGoogleAnalyticsLoaded()).toBe(false);
  expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
});