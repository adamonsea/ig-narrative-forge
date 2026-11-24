// run with: bun test ./src/lib/storyPin.test.ts
import { describe, expect, it } from "bun:test";
import { PIN_LENGTHS, activePinId, pinLeadsEmail, pinTimeLeft, withPinnedFirst, withAllPinnedFirst } from "./storyPin";

const NOW = new Date("2026-11-19T12:00:00Z").getTime();
const hoursFromNow = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

describe("story pin", () => {
  it("offers 24 hours, 2 days and 7 days only", () => {
    expect(PIN_LENGTHS.map((p) => p.hours)).toEqual([24, 48, 168]);
  });

  it("is active until the pin ends, then drops back", () => {
    expect(activePinId({ story_id: "a", pinned_until: hoursFromNow(1) }, NOW)).toBe("a");
    expect(activePinId({ story_id: "a", pinned_until: hoursFromNow(-1) }, NOW)).toBeNull();
    expect(activePinId({ story_id: null, pinned_until: hoursFromNow(1) }, NOW)).toBeNull();
  });

  it("puts the pinned story first and keeps the rest in feed order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(withPinnedFirst(items, "c").map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(withPinnedFirst(items, "zz").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(withPinnedFirst(items, null)).toBe(items);
  });

  it("says how long is left", () => {
    expect(pinTimeLeft(hoursFromNow(18.5), NOW)).toBe("18h left");
    expect(pinTimeLeft(hoursFromNow(0.5), NOW)).toBe("30m left");
    expect(pinTimeLeft(hoursFromNow(72), NOW)).toBe("3 days left");
  });

  it("leads the daily email once per pin", () => {
    const pinnedAt = hoursFromNow(-2);
    const pin = { story_id: "a", pinned_at: pinnedAt, pinned_until: hoursFromNow(22) };
    expect(pinLeadsEmail({ ...pin, daily_led_at: null }, "daily", NOW)).toBe(true);
    expect(pinLeadsEmail({ ...pin, daily_led_at: hoursFromNow(-1) }, "daily", NOW)).toBe(false);
    // An older lead (for an earlier pin) doesn't stop a new pin leading
    expect(pinLeadsEmail({ ...pin, daily_led_at: hoursFromNow(-30) }, "daily", NOW)).toBe(true);
  });

  it("leads the weekly email while the pin lasts", () => {
    const pin = { story_id: "a", pinned_at: hoursFromNow(-2), pinned_until: hoursFromNow(22), daily_led_at: hoursFromNow(-1) };
    expect(pinLeadsEmail(pin, "weekly", NOW)).toBe(true);
    expect(pinLeadsEmail({ ...pin, pinned_until: hoursFromNow(-1) }, "weekly", NOW)).toBe(false);
  });
});

describe("withAllPinnedFirst", () => {
  it("puts every pinned story first in pin order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(withAllPinnedFirst(items, ["d", "b", "zz"]).map((x) => x.id)).toEqual(["d", "b", "a", "c"]);
    expect(withAllPinnedFirst(items, [])).toBe(items);
  });
});
