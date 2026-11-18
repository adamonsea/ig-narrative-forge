/**
 * Reader view switch on public feeds: Events | All | News.
 * Shown only when the feed has both news stories and upcoming events to show.
 */
export type FeedView = "events" | "all" | "news";

/** Left to right, as shown: Events · All · News. */
export const FEED_VIEWS: readonly FeedView[] = ["events", "all", "news"];

export const FEED_VIEW_LABELS: Record<FeedView, string> = { events: "Events", all: "All", news: "News" };

export function showFeedViewToggle(eventsInFeed: boolean, eventCount: number, storyCount: number): boolean {
  return eventsInFeed && eventCount > 0 && storyCount > 0;
}

/** The view actually applied: "all" whenever the switch isn't on screen. */
export function effectiveFeedView(chosen: FeedView, toggleShown: boolean): FeedView {
  return toggleShown ? chosen : "all";
}

export const viewShowsNews = (view: FeedView) => view !== "events";
export const viewShowsEvents = (view: FeedView) => view !== "news";
