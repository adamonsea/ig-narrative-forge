// @ts-nocheck -- run with: bun test ./src/lib/deskActivity.test.ts
import { describe, it, expect } from "bun:test";
import { publishedCounts } from "./deskActivity";

// Monday 16 Nov 2026, 17:00 London (GMT)
const NOW = new Date("2026-11-16T17:00:00Z");

describe("Story pool published glance", () => {
  it("counts today, last 7 days and last 30 days by London day", () => {
    const c = publishedCounts([
      "2026-11-16T09:00:00Z", // today
      "2026-11-16T00:30:00Z", // today
      "2026-11-15T23:30:00Z", // yesterday
      "2026-11-10T12:00:00Z", // 6 days ago: still this week
      "2026-11-09T12:00:00Z", // 7 days ago: this month only
      "2026-10-18T12:00:00Z", // 29 days ago: this month
      "2026-10-17T12:00:00Z", // 30 days ago: outside
    ], NOW);
    expect(c).toEqual({ today: 2, week: 4, month: 6 });
  });

  it("uses the London day in summer time", () => {
    // 23:30 UTC on 30 Jun is 00:30 on 1 Jul in London
    const c = publishedCounts(["2026-06-30T23:30:00Z"], new Date("2026-07-01T10:00:00Z"));
    expect(c.today).toBe(1);
  });

  it("ignores missing and future times", () => {
    const c = publishedCounts([null, undefined, "nonsense", "2026-11-16T18:00:00Z"], NOW);
    expect(c).toEqual({ today: 0, week: 0, month: 0 });
  });
});
