import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FeedSplash, hideFeedSplash } from '@/components/feed/FeedSplash';
import type { FeedFirstScreen } from '@/lib/feedFirstScreen';

const firstScreen = { publicTopic: { name: 'Test feed' }, fullTopic: { branding_config: {} }, rows: [] } as unknown as FeedFirstScreen;
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Loading screen navigation', () => {
  it('allows navigation after the invisible splash is dismissed', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ opacity: '0' } as CSSStyleDeclaration);
    const page = render(<><FeedSplash firstScreen={firstScreen}/><main>Feed</main></>);
    hideFeedSplash();
    expect(() => page.unmount()).not.toThrow();
  });
  it('allows navigation after the visible splash fades out', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ opacity: '1' } as CSSStyleDeclaration);
    const page = render(<><FeedSplash firstScreen={firstScreen}/><main>Feed</main></>);
    hideFeedSplash();
    vi.runAllTimers();
    expect(() => page.unmount()).not.toThrow();
  });
  it('allows loader revalidation to remove the splash', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ opacity: '0' } as CSSStyleDeclaration);
    const page = render(<FeedSplash firstScreen={firstScreen}/>);
    hideFeedSplash();
    expect(() => page.rerender(<FeedSplash firstScreen={null}/>)).not.toThrow();
  });
});
