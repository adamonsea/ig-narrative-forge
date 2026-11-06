// @ts-nocheck -- run with: bun test ./src/lib/pulse.test.ts
import { describe, it, expect } from "bun:test";
import { pickMilestone } from "./pulse";

const base = { readers_all_time: 0, reads_today: 0, best_other_day_30: 0, dismissed: [] as string[] };
const today = "2026-11-06";

describe("pickMilestone", () => {
  it("does not fire best day below 20 reads even if it's a record", () => {
    expect(pickMilestone({ ...base, reads_today: 19, best_other_day_30: 5 }, today)).toBeNull();
  });
  it("fires best day at 20+ reads above every other day this month", () => {
    expect(pickMilestone({ ...base, reads_today: 25, best_other_day_30: 12 }, today)?.key).toBe("best_day_2026-11-06");
  });
  it("does not fire best day when another day was higher", () => {
    expect(pickMilestone({ ...base, reads_today: 25, best_other_day_30: 30 }, today)).toBeNull();
  });
  it("fires first 100 readers at 100", () => {
    expect(pickMilestone({ ...base, readers_all_time: 100 }, today)?.key).toBe("readers_100");
  });
  it("stays quiet once dismissed", () => {
    expect(pickMilestone({ ...base, readers_all_time: 150, dismissed: ["readers_100"] }, today)).toBeNull();
  });
});
