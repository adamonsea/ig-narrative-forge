// run with: bun test ./src/lib/readerStats.test.ts
import { describe, expect, test } from "bun:test";
import { likelyAutomatedRise, sourceName, feedSignal } from "./readerStats";
import { isHumanEvent } from "./humanSignal";
import { createDwellClock, STORY_PAGE_READ_MS } from "./storyPageDwell";

describe("automated-traffic self-check", () => {
  // Eastbourne, 3–16 Nov 2026: scraper visits from 12 Nov, readers flat
  const visits = [3, 4, 23, 7, 6, 8, 7, 3, 9, 30, 32, 36, 32, 14];
  const readers = [2, 3, 3, 2, 1, 2, 2, 1, 3, 2, 1, 2, 1, 0];
  test("flags visits tripling while readers stay flat", () => expect(likelyAutomatedRise(visits, readers)).toBe(true));
  test("stays quiet when readers rise with visits", () =>
    expect(likelyAutomatedRise(visits, [2, 3, 3, 2, 1, 2, 2, 1, 3, 2, 8, 9, 10, 1])).toBe(false));
  test("stays quiet on a small rise", () =>
    expect(likelyAutomatedRise([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 8, 8, 8, 2], readers)).toBe(false));
  test("needs at least 11 days", () => expect(likelyAutomatedRise([1, 50], [1, 1])).toBe(false));
});

describe("where readers came from", () => {
  test("names Google", () => expect(sourceName("www.google.co.uk")).toBe("Google"));
  test("names Gmail app", () => expect(sourceName("android.gm")).toBe("Gmail"));
  test("names Facebook link shim", () => expect(sourceName("l.facebook.com")).toBe("Facebook"));
  test("keeps other sites' own address", () => expect(sourceName("www.eastbourneunltd.co.uk")).toBe("eastbourneunltd.co.uk"));
});

describe("feed-level stopped / swiped", () => {
  test("shows with 3 readers and 22 headlines", () =>
    expect(feedSignal({ readers: 3, headlines: 22, stop_rate: 0.1818, swipe_rate: 0.0909 })).toEqual({ stopped: 18, swiped: 9, readers: 3 }));
  test("hidden under 3 readers", () => expect(feedSignal({ readers: 2, headlines: 50, stop_rate: 0.2, swipe_rate: 0.1 })).toBeNull());
  test("hidden under 20 headlines", () => expect(feedSignal({ readers: 5, headlines: 19, stop_rate: 0.2, swipe_rate: 0.1 })).toBeNull());
});

describe("human gate", () => {
  test("a touch counts", () => expect(isHumanEvent("touchstart", true, 100)).toBe(true));
  test("a script-dispatched event never counts", () => expect(isHumanEvent("pointerdown", false, 5000)).toBe(false));
  test("an early scroll (browser restoring position) doesn't count", () => expect(isHumanEvent("scroll", true, 800)).toBe(false));
  test("a later scroll counts", () => expect(isHumanEvent("scroll", true, 4000)).toBe(true));
  test("page load alone is not a signal", () => expect(isHumanEvent("load", true, 4000)).toBe(false));
});

describe("story page 10-second read", () => {
  test("threshold is 10 seconds", () => expect(STORY_PAGE_READ_MS).toBe(10000));
  test("only visible time counts", () => {
    let t = 0; const c = createDwellClock(() => t);
    c.show(); t = 6000; c.hide(); t = 60000; // hidden for 54s
    expect(c.elapsed()).toBe(6000);
    c.show(); t = 64000;
    expect(c.elapsed()).toBe(10000);
  });
});

import { bestStories, bestStoryLine, sentTotal, sentSplit, storyDetailRows, seenPerVisit, type EngagementStory } from "./readerStats";

const story = (o: Partial<EngagementStory>): EngagementStory => ({ id: "s", title: "t", reads: 0, seen: 0, opened: 0, read_through: 0, source_clicks: 0, shares: 0, ...o });

describe("best stories", () => {
  test("above the reader floor: ranked by stop score, then source clicks", () => {
    const r = bestStories([
      story({ id: "a", stop_rate: 0.2, score: 1.1, reads: 40 }),
      story({ id: "b", stop_rate: 0.4, score: 1.8, reads: 10 }),
      story({ id: "c", stop_rate: 0.3, score: 1.1, source_clicks: 5 }),
      story({ id: "d", reads: 99 }),
    ]);
    expect(r.by).toBe("stops");
    expect(r.items.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
  test("below the floor: most reads, then source clicks, never rates", () => {
    const r = bestStories([story({ id: "a", reads: 2 }), story({ id: "b", reads: 2, source_clicks: 3 }), story({ id: "c", reads: 5 }), story({ id: "z" })]);
    expect(r.by).toBe("reads");
    expect(r.items.map((s) => s.id)).toEqual(["c", "b", "a"]);
    expect(bestStoryLine(r.items[1]!, r.by)).toBe("2 reads · 3 to source");
  });
  test("at most three", () => expect(bestStories(Array.from({ length: 6 }, (_, i) => story({ id: String(i), reads: i + 1 }))).items).toHaveLength(3));
  test("rate line", () => expect(bestStoryLine(story({ stop_rate: 0.416, score: 1 }), "stops")).toBe("42% stopped"));
});

describe("sent to sources", () => {
  const sent = { stories: 4, tickets: 2, details: 1, calendar: 3 };
  test("counts clicks out to stories and events, not calendar saves", () => expect(sentTotal(sent)).toBe(7));
  test("tooltip splits every kind", () => expect(sentSplit(sent)).toBe("4 to stories · 2 to tickets · 1 to event details · 3 saved to calendar"));
});

describe("story drawer", () => {
  test("stop rate appears only above the floor", () => {
    expect(storyDetailRows(story({ seen: 3 })).some((r) => r.label === "Stopped")).toBe(false);
    expect(storyDetailRows(story({ seen: 40, stop_rate: 0.25, score: 1 })).find((r) => r.label === "Stopped")?.value).toBe("25%");
  });
  test("read to the end is shown against readers who opened it", () =>
    expect(storyDetailRows(story({ opened: 6, read_through: 4 })).find((r) => r.label === "Read to the end")?.value).toBe("4 of 6"));
});

describe("stories seen per visit", () => {
  test("hidden under 5 visits", () => expect(seenPerVisit({ visits: 4, seen_per_visit: 9, signups: 0, shares: 0 })).toBeNull());
  test("median shown from 5 visits", () => expect(seenPerVisit({ visits: 5, seen_per_visit: 8.5, signups: 0, shares: 0 })).toBe(9));
});
