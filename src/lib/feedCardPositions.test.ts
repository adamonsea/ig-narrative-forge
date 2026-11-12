// @ts-nocheck -- run with: bun test ./src/lib/feedCardPositions.test.ts
import { describe, it, expect } from 'bun:test';
import { shouldShowCard, getCardPositions, whatsOnPositions, isWhatsOnPosition, FEED_CARD_POSITIONS } from './feedCardPositions';

describe('email sign-up card positions', () => {
  it('appears after stories 3, 13, 28 and 43', () => {
    expect(getCardPositions('emailBriefing', 45)).toEqual([3, 13, 28, 43]);
  });

  it('then repeats every 15 stories', () => {
    expect(shouldShowCard('emailBriefing', 58)).toBe(true);
    expect(shouldShowCard('emailBriefing', 73)).toBe(true);
  });

  it('does not appear anywhere else in the first 45 stories', () => {
    const shown = Array.from({ length: 45 }, (_, i) => i + 1).filter((i) =>
      shouldShowCard('emailBriefing', i)
    );
    expect(shown).toEqual([3, 13, 28, 43]);
  });
});

describe("what's on card set", () => {
  it('sits after the first story, then at least 15 stories apart', () => {
    const p = whatsOnPositions(60);
    expect(p[0]).toBe(1);
    for (let i = 1; i < p.length; i++) expect(p[i] - p[i - 1] >= 15).toBe(true);
    expect(p).toEqual([1, 20, 35, 51]);
  });

  it('never shares a gap with any other extra card', () => {
    const others = Object.keys(FEED_CARD_POSITIONS).flatMap((t) => getCardPositions(t, 100));
    for (const p of whatsOnPositions(100)) expect(others).not.toContain(p);
  });

  it('answers per story position the same way', () => {
    expect(isWhatsOnPosition(1)).toBe(true);
    expect(isWhatsOnPosition(16)).toBe(false);
    expect(isWhatsOnPosition(20)).toBe(true);
  });
});
