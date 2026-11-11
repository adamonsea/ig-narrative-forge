// @ts-nocheck -- run with: bun test ./src/lib/creditScaling.test.ts
import { describe, it, expect } from 'bun:test';
import { monthlyCostForIllustrations, scalingRows, CREDIT_PRICE_LIST } from './creditScaling';

describe('credit scaling estimates', () => {
  it('Pro at $19 covers 125 standard illustrations', () => {
    expect(monthlyCostForIllustrations(125)).toBe(19);
  });
  it('one more illustration needs a $10 top-up', () => {
    expect(monthlyCostForIllustrations(126)).toBe(29);
  });
  it('1,000 standard illustrations cost $89 a month', () => {
    expect(monthlyCostForIllustrations(1000)).toBe(89);
  });
  it('scaling table rows match the published price points', () => {
    expect(scalingRows().map((r) => [r.perMonth, r.cost])).toEqual([[125, 19], [250, 29], [375, 39], [500, 49], [1000, 89]]);
  });
  it('500 credits buy 29 premium illustrations and 16 audio briefings', () => {
    const find = (u) => CREDIT_PRICE_LIST.find((r) => r.use === u).perAllowance;
    expect(find('Premium illustration')).toBe(29);
    expect(find('Audio briefing')).toBe(16);
  });
});
