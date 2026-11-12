// @ts-nocheck -- run with: bun test ./src/lib/readership.test.ts
import { describe, it, expect } from "bun:test";
import { readershipChange, MEANINGFUL_READERS } from "./readership";

describe("readership", () => {
  it("shows a rise vs last week", () => expect(readershipChange(150, 100)).toEqual({ direction: "up", percent: 50 }));
  it("shows a drop vs last week", () => expect(readershipChange(75, 100)).toEqual({ direction: "down", percent: 25 }));
  it("shows nothing without a prior week", () => expect(readershipChange(40, 0)).toBeNull());
  it("funnel and stop rates need 20 weekly readers", () => expect(MEANINGFUL_READERS).toBe(20));
});

import { barHeights } from "./readership";
describe("7-day bars", () => {
  it("tallest day is full height", () => expect(barHeights([5, 10])).toEqual([50, 100]));
  it("a day with one read is still visible", () => expect(barHeights([1, 1000])[0]).toBe(4));
  it("no reads means flat bars", () => expect(barHeights([0, 0])).toEqual([0, 0]));
});

import { dropoffCurve, topStopper, STORY_SCORE_FLOOR } from "./readership";
describe("scroll drop-off", () => {
  it("needs 30 reader-days", () => expect(dropoffCurve({ sessions: 29, reached: [29, 10] })).toBeNull());
  it("shows the share reaching each card and where half have gone", () =>
    expect(dropoffCurve({ sessions: 40, reached: [40, 30, 18, 8] })).toEqual({ percents: [100, 75, 45, 20], halfGoneBy: 3 }));
});

describe("top headline stopper", () => {
  const s = { id: "a", title: "Pier reopens", seen: 30, stop_rate: 0.3, expected_rate: 0.15, score: 1.8 };
  it("one floor of 30 outside readers", () => expect(STORY_SCORE_FLOOR).toBe(30));
  it("hidden below 30 readers", () => expect(topStopper({ ...s, seen: 29 })).toBeNull());
  it("compares with what its feed spot usually gets", () => expect(topStopper(s)?.times).toBe(2));
  it("hidden when it doesn't beat its spot", () => expect(topStopper({ ...s, stop_rate: 0.15 })).toBeNull());
});

import { storySignal } from "./readership";
describe("stopped and swiped per story", () => {
  it("hidden below 30 outside readers", () => expect(storySignal({ seen: 29, stop_rate: 0.5, swipe_rate: 0.3 })).toBeNull());
  it("shows both as percentages from 30 readers", () =>
    expect(storySignal({ seen: 30, stop_rate: 0.476, swipe_rate: 0.314 })).toEqual({ stopped: 48, swiped: 31 }));
  it("hidden when the story has no score yet", () => expect(storySignal({ seen: 40, stop_rate: null, swipe_rate: null })).toBeNull());
});
