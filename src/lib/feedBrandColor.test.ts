import { describe, it, expect } from 'vitest';
import {
  feedBrandPalette,
  contrast,
  parseColor,
  FEED_CARD_LIGHT,
  FEED_CARD_DARK,
  FEED_TEXT_DARK,
} from './feedBrandColor';

const SAMPLES = [
  '#ec4899', // Eastbourne pink
  '#10B981', // emerald
  '217 91% 60%', // default blue (bare HSL)
  '#fde047', // pale yellow
  '#f5f5f5', // near white
  '#0b1522', // near black
  '#777777', // mid grey (neither label passes untouched)
  'not-a-colour',
  null,
];

describe('feed-branded button contrast', () => {
  for (const sample of SAMPLES) {
    it(`button label passes 4.5:1 in light and dark mode for ${sample}`, () => {
      const p = feedBrandPalette(sample);
      expect(contrast(p.light.fill, p.light.onFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.dark.fill, p.dark.onFill)).toBeGreaterThanOrEqual(4.5);
    });

    it(`accent text passes 4.5:1 on the feed card in both modes for ${sample}`, () => {
      const p = feedBrandPalette(sample);
      expect(contrast(p.light.text, FEED_CARD_LIGHT)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.dark.text, FEED_CARD_DARK)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('falls back to the feed dark text colour on pale feed colours', () => {
    expect(feedBrandPalette('#fde047').light.onFill).toEqual(FEED_TEXT_DARK);
    expect(feedBrandPalette('#ec4899').light.onFill).toEqual(FEED_TEXT_DARK);
  });

  it('keeps white labels on deep feed colours', () => {
    expect(feedBrandPalette('#1d4ed8').light.onFill).toEqual([255, 255, 255]);
  });

  it('reads hex and bare HSL feed colours', () => {
    expect(parseColor('#ec4899')).toEqual([236, 72, 153]);
    expect(parseColor('0 0% 100%')).toEqual([255, 255, 255]);
  });
});
