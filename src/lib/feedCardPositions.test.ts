// @ts-nocheck -- run with: bun test ./src/lib/feedCardPositions.test.ts
import { describe, it, expect } from 'bun:test';
import { shouldShowCard, getCardPositions, getCardSlot } from './feedCardPositions';

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

describe("what's on card slots", () => {
  it('the first events slot (after story 11) shows the first set, the next shows the second', () => {
    expect(shouldShowCard('events', 11)).toBe(true);
    expect(getCardSlot('events', 11)).toBe(0);
    expect(getCardSlot('events', 22)).toBe(1);
    expect(getCardSlot('events', 33)).toBe(2);
  });
});
