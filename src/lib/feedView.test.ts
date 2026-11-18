// @ts-nocheck -- run with: bun test ./src/lib/feedView.test.ts
import { describe, expect, it } from "bun:test";
import { effectiveFeedView, FEED_VIEWS, showFeedViewToggle, viewShowsEvents, viewShowsNews } from "./feedView";

describe("feed view switch", () => {
  it("shows only when the feed has both news and events", () => {
    expect(showFeedViewToggle(true, 5, 20)).toBe(true);
    expect(showFeedViewToggle(true, 0, 20)).toBe(false); // news only
    expect(showFeedViewToggle(true, 5, 0)).toBe(false); // events only (e.g. Lisbon today)
    expect(showFeedViewToggle(false, 5, 20)).toBe(false); // events switched off for the feed
  });

  it("reads Events, All, News from left to right", () => {
    expect(FEED_VIEWS).toEqual(["events", "all", "news"]);
  });

  it("falls back to All when the switch isn't shown", () => {
    expect(effectiveFeedView("events", false)).toBe("all");
    expect(effectiveFeedView("news", true)).toBe("news");
  });

  it("Events hides news, News hides events, All shows both", () => {
    expect(viewShowsNews("events")).toBe(false);
    expect(viewShowsEvents("news")).toBe(false);
    expect(viewShowsNews("all") && viewShowsEvents("all")).toBe(true);
  });
});
