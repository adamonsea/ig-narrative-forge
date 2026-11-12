// @ts-nocheck -- run with: bun test ./src/lib/whatsOn.test.ts
import { describe, it, expect } from "bun:test";
import { isBrokenWhatsOnSource, previewSentence, venueClicksLine, showEventsInFeed, eventSourceKindLabel } from "./whatsOn";

describe("what's-on pages", () => {
  it("flags a page only after two empty checks in a row", () => {
    expect(isBrokenWhatsOnSource(0)).toBe(false);
    expect(isBrokenWhatsOnSource(1)).toBe(false);
    expect(isBrokenWhatsOnSource(2)).toBe(true);
  });

  it("previews with a count and one example", () => {
    expect(previewSentence(8, { title: "The Nutcracker", start_date: "2026-12-04" })).toBe("Found 8 upcoming events, e.g. ‘The Nutcracker’ on 4 Dec");
    expect(previewSentence(0)).toBe("No upcoming events found on this page.");
  });

  it("shows venue clicks only when there are some", () => {
    expect(venueClicksLine(0)).toBeNull();
    expect(venueClicksLine(12)).toBe("Sent 12 clicks to local venues this week");
    expect(venueClicksLine(1)).toBe("Sent 1 click to local venues this week");
  });

  it("shows events in the feed only when Events is on and Show in the feed is ticked", () => {
    expect(showEventsInFeed(true, true)).toBe(true);
    expect(showEventsInFeed(true, false)).toBe(false);
    expect(showEventsInFeed(false, true)).toBe(false);
    expect(showEventsInFeed(undefined, true)).toBe(false);
  });

  it("labels both kinds of events source", () => {
    expect(eventSourceKindLabel("calendar_feed")).toBe("Calendar feed");
    expect(eventSourceKindLabel("whats_on_page")).toBe("What's-on page");
  });
});
