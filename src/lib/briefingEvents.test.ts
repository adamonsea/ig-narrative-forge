// @ts-nocheck -- run with: bun test ./src/lib/briefingEvents.test.ts
import { describe, it, expect } from "bun:test";
import { briefingWindow, pickBriefingEvents, briefingEventsLabel } from "./briefingEvents";

const ev = (id: string, start_date: string, start_time: string | null = "19:00:00") => ({ id, title: id, start_date, start_time });
const WED = "2026-11-18";

describe("which events a briefing shows", () => {
  it("daily: today and tomorrow, for today's or yesterday's briefing only", () => {
    expect(briefingWindow("daily", WED, WED)).toEqual({ from: WED, to: "2026-11-19" });
    expect(briefingWindow("daily", "2026-11-17", WED)).toEqual({ from: WED, to: "2026-11-19" });
    expect(briefingWindow("daily", "2026-11-16", WED)).toBeNull();
  });

  it("weekly: the next 7 days, while the week runs or ended up to 7 days ago", () => {
    expect(briefingWindow("weekly", "2026-11-22", WED)).toEqual({ from: WED, to: "2026-11-24" });
    expect(briefingWindow("weekly", "2026-11-11", WED)).toEqual({ from: WED, to: "2026-11-24" });
    expect(briefingWindow("weekly", "2026-11-10", WED)).toBeNull();
  });

  it("keeps only events inside the window, soonest first", () => {
    const rows = [ev("later", "2026-11-25"), ev("tomorrow", "2026-11-19", "10:00:00"), ev("today", WED, "20:00:00")];
    expect(pickBriefingEvents(rows, { from: WED, to: "2026-11-19" }).map((e) => e.id)).toEqual(["today", "tomorrow"]);
  });

  it("shows at most 8, and a busy today never pushes tomorrow out", () => {
    const today = Array.from({ length: 10 }, (_, i) => ev(`t${i}`, WED, `1${i}:00:00`));
    const picked = pickBriefingEvents([...today, ev("tomorrow", "2026-11-19")], { from: WED, to: "2026-11-19" });
    expect(picked).toHaveLength(8);
    expect(picked.map((e) => e.id)).toContain("tomorrow");
  });

  it("shows nothing for a briefing that's too old", () => {
    expect(pickBriefingEvents([ev("today", WED)], null)).toEqual([]);
  });
});

describe("briefing events label", () => {
  it("names only the days shown", () => {
    expect(briefingEventsLabel("daily", [ev("a", WED), ev("b", "2026-11-19")], WED)).toBe("Today & tomorrow");
    expect(briefingEventsLabel("daily", [ev("a", WED)], WED)).toBe("Today");
    expect(briefingEventsLabel("daily", [ev("b", "2026-11-19")], WED)).toBe("Tomorrow");
    expect(briefingEventsLabel("weekly", [], WED)).toBe("The week ahead");
  });
});
