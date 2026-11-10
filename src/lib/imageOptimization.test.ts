import { describe, it, expect } from 'vitest';
import { optimizeImageUrl, coverPixelWidth } from './imageOptimization';

const SRC = 'https://x.supabase.co/storage/v1/object/public/visuals/story-a.webp';
const params = (u: string | null) => new URL(u!).searchParams;

describe('cover image sizing', () => {
  it('keeps the 3:2 cover shape when only a width is given', () => {
    const p = params(optimizeImageUrl(SRC, { width: 960 }));
    expect(p.get('width')).toBe('960');
    expect(p.get('height')).toBe('640');
  });

  it('respects an explicit height', () => {
    const p = params(optimizeImageUrl(SRC, { width: 200, height: 200 }));
    expect(p.get('height')).toBe('200');
  });

  it('requests enough pixels for a 380px Swipe card on a 2× screen', () => {
    expect(coverPixelWidth(380)).toBeGreaterThanOrEqual(760);
  });

  it('caps the request at the given maximum', () => {
    expect(coverPixelWidth(2000, 960)).toBe(960);
  });
});
