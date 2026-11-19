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
