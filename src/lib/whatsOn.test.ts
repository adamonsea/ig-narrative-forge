// @ts-nocheck -- run with: bun test ./src/lib/whatsOn.test.ts
import { describe, it, expect } from "bun:test";
import {
  isBrokenWhatsOnSource, previewSentence, venueClicksLine, showEventsInFeed, eventSourceKindLabel,
  splitIntoCardSets, cardSetForSlot, dateBadge, eventTime, cardSetDates, leftOutReason, leftOutSentence,
} from "./whatsOn";

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

describe("what's on card sets in the feed", () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => i + 1);

  it("keeps every set to 3–4 events once there are more than four", () => {
    expect(splitIntoCardSets(n(8)).map((s) => s.length)).toEqual([4, 4]);
    expect(splitIntoCardSets(n(7)).map((s) => s.length)).toEqual([4, 3]);
    expect(splitIntoCardSets(n(10)).map((s) => s.length)).toEqual([4, 3, 3]);
    expect(splitIntoCardSets(n(24)).map((s) => s.length)).toEqual([4, 4, 4, 4, 4, 4]);
    for (const k of [6, 7, 8, 9, 10, 11, 12, 13, 17, 23]) {
      for (const set of splitIntoCardSets(n(k))) expect(set.length >= 3 && set.length <= 4).toBe(true);
    }
  });

  it("shows four or fewer events as one set", () => {
    expect(splitIntoCardSets(n(3))).toEqual([[1, 2, 3]]);
    expect(splitIntoCardSets([])).toEqual([]);
  });

  it("keeps soonest-first order across sets, with no event shown twice", () => {
    expect(splitIntoCardSets(n(7)).flat()).toEqual(n(7));
  });

  it("gives each feed slot the next set, then starts again", () => {
    const sets = splitIntoCardSets(n(8));
    expect(cardSetForSlot(sets, 0)).toEqual([1, 2, 3, 4]);
    expect(cardSetForSlot(sets, 1)).toEqual([5, 6, 7, 8]);
    expect(cardSetForSlot(sets, 2)).toEqual([1, 2, 3, 4]);
    expect(cardSetForSlot([], 0)).toBeNull();
  });

  it("formats the date badge and time", () => {
    expect(dateBadge("2026-11-12")).toEqual({ weekday: "THU", day: "12", month: "NOV" });
    expect(eventTime("10:30:00")).toBe("10:30am");
    expect(eventTime("19:00:00")).toBe("7pm");
    expect(eventTime("00:00:00")).toBe("12am");
    expect(eventTime(null)).toBeNull();
  });

  it("names the dates a set covers", () => {
    const today = "2026-11-12";
    expect(cardSetDates([{ start_date: "2026-11-12" }], today)).toBe("Today");
    expect(cardSetDates([{ start_date: "2026-11-12" }, { start_date: "2026-11-13" }], today)).toBe("Today – Tomorrow");
    expect(cardSetDates([{ start_date: "2026-11-28" }, { start_date: "2026-12-01" }], today)).toBe("Sat 28 Nov – Tue 1 Dec");
  });
});

describe("events left out of the feed", () => {
  it("explains why in plain words", () => {
    expect(leftOutReason("excluded", "outside_area")).toBe("Outside your area");
    expect(leftOutReason("excluded", "online")).toBe("Online only");
    expect(leftOutReason("excluded", "unconfirmed")).toBe("Couldn't confirm it's local");
    expect(leftOutReason("deleted", null)).toBe("Removed by you");
  });

  it("mentions left-out events in the preview only when there are some", () => {
    expect(leftOutSentence(0)).toBeNull();
    expect(leftOutSentence(1)).toBe("1 event outside your area will be left out.");
    expect(leftOutSentence(5)).toBe("5 events outside your area will be left out.");
  });
});
