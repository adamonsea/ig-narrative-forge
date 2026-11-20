// run with: bun test ./src/lib/readerDefinition.test.ts
import { describe, expect, test } from 'bun:test';
import { readerFigures, type Signal } from './readerDefinition';

const now = new Date('2026-11-20T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const sig = (o: Partial<Signal>): Signal => ({ visitorId: 'visitor_a1', storyId: 's1', kind: 'swipe', at: ago(1), ...o });

describe('one reader definition', () => {
  test('reading now never exceeds readers today, and readers never exceed reads', () => {
    const f = readerFigures([
      sig({}), sig({ storyId: 's2', kind: 'page_dwell' }), sig({ visitorId: 'visitor_b2', kind: 'headline', dwellMs: 3200, at: ago(40) }),
    ], now);
    expect(f).toEqual({ readingNow: 1, readersToday: 2, readsToday: 3 });
  });
  test('sv_ and visitor_ prefixes are one person', () => {
    const f = readerFigures([sig({ visitorId: 'sv_a1', kind: 'page_dwell' }), sig({ visitorId: 'visitor_a1' })], now);
    expect(f.readingNow).toBe(1);
    expect(f.readsToday).toBe(1);
  });
  test('a test browser never counts', () => {
    expect(readerFigures([sig({ visitorId: 'visitor_zztest_pw' }), sig({ visitorId: 'sv_zztest_x' })], now).readersToday).toBe(0);
  });
  test('the owner and preview browsers never count', () => {
    expect(readerFigures([sig({ visitorId: 'visitor_owner1' })], now, new Set(['owner1'])).readersToday).toBe(0);
  });
  test('a bare story-page load, source click or share is not a read', () => {
    const f = readerFigures([sig({ kind: 'page_load' }), sig({ kind: 'source_click' }), sig({ kind: 'share_click' })], now);
    expect(f).toEqual({ readingNow: 0, readersToday: 0, readsToday: 0 });
  });
  test('a 3-second headline stop counts as a read; a shorter glance does not', () => {
    expect(readerFigures([sig({ kind: 'headline', dwellMs: 3000 })], now).readsToday).toBe(1);
    expect(readerFigures([sig({ kind: 'headline', dwellMs: 2900 })], now).readsToday).toBe(0);
  });
  test('an idle open tab drops out of reading now after 5 minutes', () => {
    expect(readerFigures([sig({ at: ago(5) })], now).readingNow).toBe(1);
    expect(readerFigures([sig({ at: ago(6) })], now).readingNow).toBe(0);
    expect(readerFigures([sig({ at: ago(6) })], now).readersToday).toBe(1);
  });
});
