// run with: bun test ./src/lib/creditScaling.test.ts
import { describe, it, expect } from 'bun:test';
import { monthlyCostForIllustrations, scalingRows, CREDIT_PRICE_LIST } from './creditScaling';
import { PRO_MONTHLY_CREDITS, IMAGE_CREDIT_COSTS } from './billing';

describe('credit scaling estimates', () => {
  it('Pro includes 1,000 credits a month', () => {
    expect(PRO_MONTHLY_CREDITS).toBe(1000);
  });
  it('an Autopilot picture costs 1 credit', () => {
    expect(IMAGE_CREDIT_COSTS['gpt-image-2-low']).toBe(1);
    expect(CREDIT_PRICE_LIST.find((r) => r.use === 'Autopilot picture')!.credits).toBe(1);
  });
  it('Pro at $19 covers 250 standard illustrations', () => {
    expect(monthlyCostForIllustrations(250)).toBe(19);
  });
  it('one more illustration needs a $10 top-up', () => {
    expect(monthlyCostForIllustrations(251)).toBe(29);
  });
  it('1,000 standard illustrations cost $79 a month', () => {
    expect(monthlyCostForIllustrations(1000)).toBe(79);
  });
  it('scaling table rows match the published price points', () => {
    expect(scalingRows().map((r) => [r.perMonth, r.cost])).toEqual([[250, 19], [375, 29], [500, 39], [625, 49], [1000, 79]]);
  });
  it('1,000 credits buy 58 premium illustrations and 33 audio briefings', () => {
    const find = (u: string) => CREDIT_PRICE_LIST.find((r) => r.use === u)!.perAllowance;
    expect(find('Premium illustration')).toBe(58);
    expect(find('Audio briefing')).toBe(33);
  });
});
