// run with: bun test ./src/lib/feedCardPositions.test.ts
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
    for (let i = 1; i < p.length; i++) expect(p[i]! - p[i - 1]! >= 15).toBe(true);
    expect(p).toEqual([1, 20, 35, 51]);
  });

  it('never shares a gap with any other extra card', () => {
    const others = (Object.keys(FEED_CARD_POSITIONS) as (keyof typeof FEED_CARD_POSITIONS)[]).flatMap((t) => getCardPositions(t, 100));
    for (const p of whatsOnPositions(100)) expect(others).not.toContain(p);
  });

  it('answers per story position the same way', () => {
    expect(isWhatsOnPosition(1)).toBe(true);
    expect(isWhatsOnPosition(16)).toBe(false);
    expect(isWhatsOnPosition(20)).toBe(true);
  });
});

import { eventCardMode, eventsBeforeNews, eventsLedRun } from './feedCardPositions';

describe('events-led feeds', () => {
  it('news-led feeds keep grouped event cards, events-led default to individual', () => {
    expect(eventCardMode('news', null)).toBe('grouped');
    expect(eventCardMode(undefined, undefined)).toBe('grouped');
    expect(eventCardMode('events', null)).toBe('individual');
    expect(eventCardMode('events', 'grouped')).toBe('grouped');
  });
  it('news slots in after event 3, then every 5 events', () => {
    expect([1, 2, 3, 4].map((n) => eventsBeforeNews(n))).toEqual([3, 8, 13, 18]);
  });
  it('every event appears exactly once, in order, around the news', () => {
    const run = eventsLedRun(20, 2, true);
    expect(run.filter((i) => i.kind === 'event').map((i) => i.index)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});

import { newsSlotsWithin } from "./feedCardPositions";
describe("events-led run", () => {
  it("news slots in after events 3, 8, 13, 18 in the first 20 events", () => {
    const run = eventsLedRun(20, 10, false);
    const storiesAfter = run.flatMap((item, k) => item.kind === "story" ? [run.slice(0, k).filter((x) => x.kind === "event").length] : []);
    expect(storiesAfter).toEqual([3, 8, 13, 18]);
    expect(newsSlotsWithin(20)).toBe(4);
  });
  it("extra cards count against events, not news", () => {
    const run = eventsLedRun(20, 10, false);
    expect(run.filter((i) => i.kind === "event").map((i) => i.extrasAt)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(run.filter((i) => i.kind === "story").every((i) => i.extrasAt === null)).toBe(true);
  });
  it("stories wait for more events until every event is loaded, then follow and keep counting", () => {
    expect(eventsLedRun(4, 3, false).filter((i) => i.kind === "story")).toHaveLength(1);
    const done = eventsLedRun(4, 3, true);
    expect(done.map((i) => `${i.kind[0]}${i.extrasAt ?? "-"}`)).toEqual(["e1", "e2", "e3", "s-", "e4", "s5", "s6"]);
  });
  it("a feed with only events is just its events", () => {
    expect(eventsLedRun(3, 0, true).map((i) => i.kind)).toEqual(["event", "event", "event"]);
  });
});
