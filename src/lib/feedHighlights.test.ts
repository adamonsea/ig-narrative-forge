// @ts-nocheck -- run with: bun test ./src/lib/feedHighlights.test.ts
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

describe("google search highlights", () => {
  test("search up needs 100+ views last week and a 25%+ rise", () => {
    expect(pickHighlight(s({ search_impressions_week: 1240, search_impressions_prev: 900 }), "X", TODAY)?.text)
      .toBe("Your feed appeared in Google 1,240 times this week");
    expect(pickHighlight(s({ search_impressions_week: 160, search_impressions_prev: 80 }), "X", TODAY)).toBeNull();
    expect(pickHighlight(s({ search_impressions_week: 110, search_impressions_prev: 100 }), "X", TODAY)).toBeNull();
  });
  test("a search drop is never cheered", () => {
    const h = pickHighlight(s({ search_impressions_week: 300, search_impressions_prev: 500, search_weeks: 6, search_best_prior_week: 100 }), "X", TODAY);
    expect(h).toBeNull();
  });
  test("top search story needs 5+ clicks and nudges sharing that story", () => {
    const st = s({ top_search_story_id: "abc", top_search_story_title: "Pier reopens", top_search_story_clicks: 5 });
    const h = pickHighlight(st, "X", TODAY);
    expect(h?.text).toBe("\"Pier reopens\" was your top search story");
    expect(pickNudge(h, st)).toMatchObject({ kind: "share_story", storyId: "abc" });
    expect(pickHighlight(s({ ...st, top_search_story_clicks: 4 }), "X", TODAY)).toBeNull();
  });
  test("best search week needs 4+ weeks and 200+ views", () => {
    expect(pickHighlight(s({ search_impressions_week: 250, search_impressions_prev: 240, search_weeks: 4, search_best_prior_week: 240 }), "X", TODAY)?.kind).toBe("best_search_week");
    expect(pickHighlight(s({ search_impressions_week: 250, search_impressions_prev: 240, search_weeks: 3, search_best_prior_week: 240 }), "X", TODAY)).toBeNull();
  });
  test("search total sits in the fallback ladder after reads", () => {
    expect(pickHighlight(s({ search_impressions_total: 600, subscribers_total: 50 }), "X", TODAY)?.kind).toBe("fallback_search_total");
    expect(pickHighlight(s({ search_impressions_total: 600, reads_total: 200 }), "X", TODAY)?.kind).toBe("fallback_reads_total");
  });
});

describe("eye-catching headline", () => {
  const eye = { top_stop_story_id: "st1", top_stop_story_title: "Pier reopens", top_stop_rate: 0.48, top_stop_seen: 30,
    median_stop_rate: 0.2, stop_qualifying_stories: 5 };
  test("20+ seen, 25%+ and 1.5x typical is cheered with a share nudge", () => {
    const st = s(eye);
    const h = pickHighlight(st, "X", TODAY);
    expect(h?.text).toBe("\"Pier reopens\" stopped 48% of scrollers — your most eye-catching headline");
    expect(pickNudge(h, st)).toMatchObject({ kind: "share_story", storyId: "st1" });
  });
  test("too few readers who saw it shows nothing", () => {
    expect(pickHighlight(s({ ...eye, top_stop_seen: 19 }), "X", TODAY)).toBeNull();
  });
  test("not clearly above the feed's typical rate shows nothing", () => {
    expect(pickHighlight(s({ ...eye, median_stop_rate: 0.35 }), "X", TODAY)).toBeNull();
    expect(pickHighlight(s({ ...eye, stop_qualifying_stories: 2 }), "X", TODAY)).toBeNull();
    expect(pickHighlight(s({ ...eye, top_stop_rate: 0.24, median_stop_rate: 0.1 }), "X", TODAY)).toBeNull();
  });
});
