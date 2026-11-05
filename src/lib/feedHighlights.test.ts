import { describe, expect, test } from "bun:test";
import { pickHighlight, pickNudge, type HighlightStats } from "./feedHighlights";

const TODAY = new Date("2026-11-05T12:00:00Z");
const base: HighlightStats = {
  reads_week: 0, reads_prev_week: 0, readers_week: 0, readers_prev_week: 0, weekly_reads: [0, 0, 0, 0, 0, 0, 0, 0],
  first_read_date: "2026-11-04", best_prior_day: 0, best_day_date: null, best_day_reads: 0,
  top_story_id: null, top_story_title: null, top_story_reads: 0, median_story_reads: 0,
  subscribers_total: 0, subscribers_week: 0, new_referrer: null, new_referrer_readers: 0,
  return_rate_week: null, return_rate_prev: null, loyal_reader_days: 0, new_country: null, new_country_readers: 0,
  reads_total: 0, published_total: 0, top_weekday: null, top_weekday_share: null,
};
const s = (o: Partial<HighlightStats>) => ({ ...base, ...o });

describe("highlight picker", () => {
  test("1 to 2 readers is not cheered", () => {
    expect(pickHighlight(s({ readers_week: 2, readers_prev_week: 1, reads_week: 2, reads_prev_week: 1 }), "X", TODAY)).toBeNull();
  });
  test("reads up needs 20+ reads last week and 15%+ rise", () => {
    expect(pickHighlight(s({ reads_week: 26, reads_prev_week: 20 }), "X", TODAY)?.kind).toBe("reads_up");
    expect(pickHighlight(s({ reads_week: 22, reads_prev_week: 20 }), "X", TODAY)).toBeNull();
  });
  test("a drop never yields reads-up copy and falls back", () => {
    const h = pickHighlight(s({ reads_week: 290, reads_prev_week: 354, readers_week: 41, readers_prev_week: 30, subscribers_total: 76 }), "Eastbourne", TODAY);
    expect(h?.kind).toBe("fallback_subscribers");
    expect(h?.text).toBe("76 people chose to follow Eastbourne");
  });
  test("subscriber milestone beats everything", () => {
    expect(pickHighlight(s({ subscribers_total: 101, subscribers_week: 4, reads_week: 60, reads_prev_week: 20 }), "X", TODAY)?.kind).toBe("milestone");
  });
  test("story took off needs 3x median and 25 reads", () => {
    const st = { top_story_id: "a", top_story_title: "Pier", median_story_reads: 10 };
    expect(pickHighlight(s({ ...st, top_story_reads: 34 }), "X", TODAY)?.kind).toBe("story_took_off");
    expect(pickHighlight(s({ ...st, top_story_reads: 24, median_story_reads: 5 }), "X", TODAY)).toBeNull();
  });
  test("fallback ladder order", () => {
    expect(pickHighlight(s({ reads_total: 150, subscribers_total: 76 }), "X", TODAY)?.kind).toBe("fallback_reads_total");
    expect(pickHighlight(s({ loyal_reader_days: 6, published_total: 40 }), "X", TODAY)?.kind).toBe("fallback_loyal");
    expect(pickHighlight(s({ published_total: 40 }), "X", TODAY)?.kind).toBe("fallback_published");
  });
  test("new subscribers needs at least 3", () => {
    expect(pickHighlight(s({ subscribers_week: 2 }), "X", TODAY)).toBeNull();
    expect(pickHighlight(s({ subscribers_week: 3 }), "X", TODAY)?.kind).toBe("new_subscribers");
  });
});

describe("nudge mapping", () => {
  test("referrer -> embed; story -> share; fallback -> share feed", () => {
    expect(pickNudge({ kind: "new_referrer", text: "", score: 60 }, base).kind).toBe("embed");
    expect(pickNudge({ kind: "story_took_off", text: "", score: 80 }, s({ top_story_id: "a" })).kind).toBe("share_story");
    expect(pickNudge(null, base).kind).toBe("share_feed");
  });
});
