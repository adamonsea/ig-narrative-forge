// run with: bun test ./src/lib/feedSurfaces.test.ts
import { describe, it, expect } from 'bun:test';
import { contrast, feedBrandPalette, FEED_CARD_LIGHT, hslToRgb, parseColor } from './feedBrandColor';
import {
  BACKGROUND_PRESETS, TOP_BAR_PRESETS, backgroundTones, feedSurfaceStyles, hslTriplet, resolveSurface, topBarTones,
} from './feedSurfaces';

const BRANDS = ['#ec4899', '#10B981', '#fde047', '#f5f5f5', '#0b1522', '#2563EB', '#B91C1C', null];
const EXTRA_BARS = ['#000000', '#7f7f7f', '#ffe600', '#00ff88'];

describe('feed surfaces', () => {
  it('leaves the feed exactly as before when nothing is chosen', () => {
    const s = feedSurfaceStyles({ brand: '#ec4899' });
    expect(s.root).toBeUndefined();
    expect(s.header).toBeUndefined();
    expect(s.customTopBar).toBe(false);
  });

  it('keeps every element on the top bar readable (AA) for every preset and brand colour', () => {
    for (const brand of BRANDS) {
      for (const choice of [...TOP_BAR_PRESETS.map((p) => p.value), ...EXTRA_BARS]) {
        const bar = resolveSurface(choice, brand, '#FFFFFF');
        const t = topBarTones(bar, brand);
        expect(contrast(t.text, bar)).toBeGreaterThanOrEqual(contrast([255, 255, 255], bar) >= 7 || contrast([0, 0, 0], bar) >= 7 ? 7 : 4.5);
        expect(contrast(t.muted, bar)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.live, bar)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.accent, bar)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.text, t.button)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.button, bar)).toBeGreaterThanOrEqual(1.12);
      }
    }
  });

  it('keeps text on the background readable and the view switch outlined', () => {
    for (const choice of [...BACKGROUND_PRESETS.map((p) => p.value), '#FFFFFF', '#000000', '#ffe600']) {
      const bg = resolveSurface(choice, null, '#22272B');
      const t = backgroundTones(bg);
      expect(contrast(t.text, bg)).toBeGreaterThanOrEqual(contrast([255, 255, 255], bg) >= 7 || contrast([0, 0, 0], bg) >= 7 ? 7 : 4.5);
      expect(contrast(t.muted, bg)).toBeGreaterThanOrEqual(4.5);
      const pillStandsOut = contrast(FEED_CARD_LIGHT, bg) >= 1.5 || contrast(t.toggleBorder, bg) >= 1.5;
      expect(pillStandsOut).toBe(true);
    }
  });

  it('"Feed colour" top bar follows the feed colour', () => {
    expect(resolveSurface('brand', '#2563EB', '#FFFFFF')).toEqual(feedBrandPalette('#2563EB').light.fill);
  });

  it('ignores unreadable stored values', () => {
    const s = feedSurfaceStyles({ topBar: 'not a colour', background: '' });
    expect(s.header).toBeUndefined();
    expect(s.root).toBeUndefined();
  });

  it('writes tokens as HSL components that round-trip', () => {
    const rgb = parseColor('#0B1522')!;
    const [h, sat, l] = hslTriplet(rgb).replace(/%/g, '').split(' ').map(Number);
    const back = hslToRgb(h!, sat!, l!);
    back.forEach((c, i) => expect(Math.abs(c - rgb[i]!)).toBeLessThanOrEqual(1));
  });
});
