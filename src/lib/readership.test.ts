// @ts-nocheck -- run with: bun test ./src/lib/readership.test.ts
import { describe, it, expect } from "bun:test";
import { readershipChange, MEANINGFUL_READERS } from "./readership";

describe("readership", () => {
  it("shows a rise vs last week", () => expect(readershipChange(150, 100)).toEqual({ direction: "up", percent: 50 }));
  it("shows a drop vs last week", () => expect(readershipChange(75, 100)).toEqual({ direction: "down", percent: 25 }));
  it("shows nothing without a prior week", () => expect(readershipChange(40, 0)).toBeNull());
  it("funnel and stop rates need 20 weekly readers", () => expect(MEANINGFUL_READERS).toBe(20));
});
