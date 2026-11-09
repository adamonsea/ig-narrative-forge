import { describe, it, expect } from 'vitest';
import { READER_ONBOARDING_EXTRAS } from './featureFlags';
import { shouldShowSwipeHint } from '@/components/HandSwipeHint';

describe('reader first visit', () => {
  it('onboarding extras are paused on public feeds', () => {
    expect(READER_ONBOARDING_EXTRAS).toBe(false);
  });
  it('swipe hint shows on the first visit only', () => {
    expect(shouldShowSwipeHint(0)).toBe(true);
    expect(shouldShowSwipeHint(1)).toBe(false);
  });
});
