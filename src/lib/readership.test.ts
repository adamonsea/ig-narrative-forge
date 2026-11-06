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
