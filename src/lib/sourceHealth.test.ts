// run with: bun test ./src/lib/sourceHealth.test.ts
import { describe, expect, it } from "bun:test";
import { attentionOrder, eventSourceHealth, newsSourceHealth, typicalGapDays } from "./sourceHealth";

const today = "2026-11-17";
const daily = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];

describe("source health follows each source's own rhythm", () => {
  it("works out the usual gap between arrival days", () => {
    expect(typicalGapDays(daily)).toBe(1);
    expect(typicalGapDays(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"])).toBe(7);
    expect(typicalGapDays(["2026-11-01", "2026-11-02"])).toBeNull();
  });

  it("a daily source is fine after 2 quiet days and amber at 3 (2.5x its gap)", () => {
    expect(newsSourceHealth({ arrivalDays: daily.slice(0, 4).concat("2026-11-15"), today }).health).toBe("healthy");
    expect(newsSourceHealth({ arrivalDays: daily, today }).health).toBe("quiet");
  });

  it("a every-4-days source stays green after 5 quiet days, amber at 10", () => {
    const every4 = ["2026-10-20", "2026-10-24", "2026-10-28", "2026-11-01", "2026-11-05", "2026-11-12"];
    expect(newsSourceHealth({ arrivalDays: every4, today }).health).toBe("healthy");
    expect(newsSourceHealth({ arrivalDays: every4.slice(0, 5), today: "2026-11-15" }).health).toBe("quiet");
  });

  it("red after 3 failed reads in a row, whatever the rhythm", () => {
    expect(newsSourceHealth({ arrivalDays: daily.concat("2026-11-17"), consecutiveFailures: 3, today }).health).toBe("failing");
    expect(newsSourceHealth({ arrivalDays: daily.concat("2026-11-17"), consecutiveFailures: 2, today }).health).toBe("healthy");
  });

  it("red after nothing in 14 days, even for a weekly source", () => {
    const weekly = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-11-03"];
    expect(newsSourceHealth({ arrivalDays: weekly, today }).health).toBe("failing");
    expect(newsSourceHealth({ arrivalDays: weekly, today: "2026-11-16" }).health).toBe("healthy");
  });

  it("with little history, amber after a week of silence", () => {
    expect(newsSourceHealth({ arrivalDays: ["2026-11-10"], today }).health).toBe("quiet");
    expect(newsSourceHealth({ arrivalDays: ["2026-11-11"], today }).health).toBe("healthy");
  });

  it("new sources: neutral for 3 days, amber until 14, then red", () => {
    expect(newsSourceHealth({ arrivalDays: [], addedAt: "2026-11-16T10:00:00Z", today }).health).toBe("new");
    expect(newsSourceHealth({ arrivalDays: [], addedAt: "2026-11-10T10:00:00Z", today }).health).toBe("quiet");
    expect(newsSourceHealth({ arrivalDays: [], addedAt: "2026-11-01T10:00:00Z", today }).health).toBe("failing");
  });

  it("events sources: two empty checks red, nothing coming up amber", () => {
    expect(eventSourceHealth({ consecutiveEmptyChecks: 2, lastCheckedAt: "x", upcoming: 5 }).health).toBe("failing");
    expect(eventSourceHealth({ consecutiveEmptyChecks: 0, lastCheckedAt: "x", upcoming: 0 }).health).toBe("quiet");
    expect(eventSourceHealth({ consecutiveEmptyChecks: 1, lastCheckedAt: "x", upcoming: 3 }).health).toBe("healthy");
  });

  it("sources needing attention are pinned first: red, amber, then the rest by name", () => {
    const list = [
      { name: "B", health: "healthy" as const }, { name: "A", health: "quiet" as const },
      { name: "C", health: "failing" as const }, { name: "A2", health: "healthy" as const },
    ].sort(attentionOrder);
    expect(list.map((s) => s.name)).toEqual(["C", "A", "A2", "B"]);
  });
});
