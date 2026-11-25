// run with: bun test ./src/lib/usageBars.test.ts
import { describe, it, expect } from 'bun:test';
import { usagePercent, usageThreshold, pausedAction } from './usageBars';

describe('usage bars', () => {
  it('alerts at 75, 90 and 100 percent', () => {
    expect(usageThreshold({ used: 749, limit: 1000 })).toBeNull();
    expect(usageThreshold({ used: 750, limit: 1000 })).toBe(75);
    expect(usageThreshold({ used: 900, limit: 1000 })).toBe(90);
    expect(usageThreshold({ used: 1000, limit: 1000 })).toBe(100);
  });
  it('free trial: 30 stories is full', () => {
    expect(usagePercent({ used: 30, limit: 30 })).toBe(100);
    expect(usagePercent({ used: 45, limit: 30 })).toBe(100);
  });
  it('paused button is Upgrade for free, Top up for Pro', () => {
    expect(pausedAction(false)).toBe('Upgrade');
    expect(pausedAction(true)).toBe('Top up');
  });
});
