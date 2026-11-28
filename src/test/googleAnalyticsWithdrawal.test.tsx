import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { trackEvent, useGoogleAnalytics } from '@/hooks/useGoogleAnalytics';

const reader = vi.hoisted(() => ({ mode: 'full' }));
vi.mock('@/lib/readerConsent', () => ({ currentReaderMode: () => reader.mode }));
vi.mock('@/lib/googleAnalyticsLoader', () => ({ isGoogleAnalyticsLoaded: () => true }));
vi.mock('@/lib/router-compat', () => ({ useLocation: () => ({ pathname: '/feed/test', search: '' }) }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it('Essential only blocks custom analytics events even when the tag was previously loaded', () => {
  window.gtag = vi.fn();
  reader.mode = 'off';
  trackEvent('share');
  expect(window.gtag).not.toHaveBeenCalled();
  reader.mode = 'full';
  trackEvent('share');
  expect(window.gtag).toHaveBeenCalledWith('event', 'share', undefined);
});

it('withdrawing blocks a page view waiting for the updated page title', async () => {
  vi.useFakeTimers();
  window.gtag = vi.fn();
  reader.mode = 'full';
  renderHook(useGoogleAnalytics);
  reader.mode = 'off';
  await vi.advanceTimersByTimeAsync(100);
  expect(window.gtag).not.toHaveBeenCalled();
});