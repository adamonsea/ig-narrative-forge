import { describe, expect, test } from "bun:test";
import { visibleRise, weekChange } from "./FeedStatsCard";

describe("feed card week-on-week change", () => {
  test("shows a rise of 10% or more", () => expect(visibleRise(weekChange(44, 40))).toBe(10));
  test("hides a rise under 10%", () => expect(visibleRise(weekChange(43, 40))).toBeNull());
  test("never shows a drop", () => expect(visibleRise(weekChange(20, 40))).toBeNull());
});
