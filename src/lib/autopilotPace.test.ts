// @ts-nocheck -- run with: bun test ./src/lib/autopilotPace.test.ts
import { describe, expect, test } from "bun:test";
import { paceFields, paceOf } from "./autopilotPace";

describe("autopilot pace", () => {
  test("as soon as ready turns batching off", () => {
    expect(paceFields("now")).toEqual({ drip_feed_enabled: false });
  });
  test("each choice reads back as itself", () => {
    expect(paceOf(paceFields("now"))).toBe("now");
    expect(paceOf(paceFields("spread"))).toBe("spread");
    expect(paceOf(paceFields("twice"))).toBe("twice");
  });
  test("twice a day gives two release slots", () => {
    const p = paceFields("twice");
    expect(Math.floor((p.drip_end_hour - p.drip_start_hour) / p.drip_release_interval_hours)).toBe(2);
  });
  test("an existing hand-tuned pace shows as custom, not overwritten", () => {
    expect(paceOf({ drip_feed_enabled: true, drip_release_interval_hours: 4, drip_stories_per_release: 2, drip_start_hour: 6, drip_end_hour: 22 })).toBe(null);
  });
});
