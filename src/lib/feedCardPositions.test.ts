// @ts-nocheck -- run with: bun test ./src/lib/feedCardPositions.test.ts
import { describe, it, expect } from 'bun:test';
import { shouldShowCard, getCardPositions } from './feedCardPositions';

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
