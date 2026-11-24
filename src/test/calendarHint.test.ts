import { describe, expect, it } from "vitest";
import { animatesCalendarHint } from "@/lib/calendarHint";

const animated = (upTo: number) => Array.from({ length: upTo }, (_, i) => i + 1).filter(animatesCalendarHint);

describe("calendar badge motion", () => {
  it("plays on the first two event cards", () => {
    expect(animatesCalendarHint(1)).toBe(true);
    expect(animatesCalendarHint(2)).toBe(true);
    expect(animatesCalendarHint(3)).toBe(false);
  });
  it("plays every fifth card through the next ten", () => {
    expect(animated(12)).toEqual([1, 2, 6, 11]);
  });
  it("then plays only every twentieth card", () => {
    expect(animated(80)).toEqual([1, 2, 6, 11, 31, 51, 71]);
  });
});
