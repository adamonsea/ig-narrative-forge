// @ts-nocheck -- run with: bun test ./src/lib/whatsOn.test.ts
import { describe, it, expect } from "bun:test";
import {
  isBrokenWhatsOnSource, previewSentence, venueClicksLine, showEventsInFeed, eventSourceKindLabel,
  dateBadge, eventTime, upcomingWhatsOn, eventGroup, coverSentence, detectSourceKind, isEventsSourceKind,
  hiddenReason, hiddenSentence, isLowRelevance, onePerTitle,
} from "./whatsOn";

const ev = (title: string, start_date: string, start_time: string | null = "19:00:00") =>
  ({ id: title, title, start_date, start_time, location: "v", source_name: "s", source_url: "https://x" });

// Thursday 12 Nov 2026
const THU = "2026-11-12";

describe("events sources", () => {
  it("flags a source only after two empty checks in a row", () => {
    expect(isBrokenWhatsOnSource(1)).toBe(false);
    expect(isBrokenWhatsOnSource(2)).toBe(true);
  });

  it("previews with a count and one example", () => {
    expect(previewSentence(8, { title: "The Nutcracker", start_date: "2026-12-04" })).toBe("Found 8 upcoming events, e.g. ‘The Nutcracker’ on 4 Dec");
    expect(previewSentence(0)).toBe("No upcoming events found on this page.");
  });

  it("labels both kinds of events source", () => {
    expect(eventSourceKindLabel("calendar_feed")).toBe("Calendar feed");
    expect(eventSourceKindLabel("whats_on_page")).toBe("What's-on page");
  });

  it("detects the kind of source from the link", () => {
    expect(detectSourceKind("https://bournefree.co.uk/feed/")).toBe("rss");
    expect(detectSourceKind("https://members.eastbourneunltd.co.uk/ajax_website/ajax_retrieveevents.php")).toBe("calendar_feed");
    expect(detectSourceKind("https://example.org/events.ics")).toBe("calendar_feed");
    expect(detectSourceKind("https://www.eastbournetheatres.co.uk/whats-on")).toBe("whats_on_page");
    expect(detectSourceKind("https://www.eventbrite.co.uk/d/united-kingdom--eastbourne/events")).toBe("whats_on_page");
    expect(detectSourceKind("https://www.ticketsource.co.uk/towner")).toBe("whats_on_page");
    expect(detectSourceKind("https://www.lewes-eastbourne.gov.uk/news")).toBe("website");
    expect(isEventsSourceKind("rss")).toBe(false);
    expect(isEventsSourceKind("calendar_feed")).toBe(true);
  });

  it("shows venue clicks only when there are some", () => {
    expect(venueClicksLine(0)).toBeNull();
    expect(venueClicksLine(12)).toBe("Sent 12 clicks to local venues this week");
  });
});

describe("the What's on card set", () => {
  it("shows events only when Events is on and Show in the feed is ticked", () => {
    expect(showEventsInFeed(true, true)).toBe(true);
    expect(showEventsInFeed(true, false)).toBe(false);
    expect(showEventsInFeed(false, true)).toBe(false);
  });

  it("keeps at most 8 events from the next 14 days, soonest first, dropping past ones", () => {
    const events = [ev("past", "2026-11-11"), ev("far", "2026-11-26"), ...Array.from({ length: 10 }, (_, i) => ev(`e${i}`, `2026-11-${String(12 + i).padStart(2, "0")}`))];
    const out = upcomingWhatsOn(events, THU);
    expect(out.length).toBe(8);
    expect(out[0].start_date).toBe(THU);
    expect(out.map((e) => e.title)).not.toContain("past");
    expect(out.map((e) => e.title)).not.toContain("far");
    expect(upcomingWhatsOn([ev("last day", "2026-11-25")], THU).length).toBe(1);
  });

  it("groups as Tonight / This weekend / Next week", () => {
    expect(eventGroup(ev("a", THU, "20:00:00"), THU)).toBe("Tonight");
    expect(eventGroup(ev("b", "2026-11-14"), THU)).toBe("This weekend");
    expect(eventGroup(ev("c", "2026-11-18"), THU)).toBe("Next week");
  });

  it("cover names the first two events then the rest as a count", () => {
    const events = [ev("Jazz at The Lamb", THU, "20:00:00"), ev("The Nutcracker", "2026-11-14"), ...[1, 2, 3, 4, 5, 6].map((n) => ev(`x${n}`, "2026-11-20"))];
    expect(coverSentence(events, THU)).toBe("Tonight: Jazz at The Lamb · Sat: The Nutcracker + 6 more");
    expect(coverSentence(events.slice(0, 3), THU)).toBe("Tonight: Jazz at The Lamb · Sat: The Nutcracker · Fri: x1");
  });

  it("formats the date badge and time", () => {
    expect(dateBadge("2026-11-12")).toEqual({ weekday: "THU", day: "12", month: "NOV" });
    expect(eventTime("10:30:00")).toBe("10:30am");
    expect(eventTime("19:00:00")).toBe("7pm");
    expect(eventTime(null)).toBeNull();
  });
});

describe("events on the Desk", () => {
  it("explains Hidden in plain words", () => {
    expect(hiddenReason("excluded", "outside_area")).toBe("Out of area");
    expect(hiddenReason("excluded", "online")).toBe("Out of area · online");
    expect(hiddenReason("deleted", null)).toBe("Skipped");
  });

  it("ranks events under 25 as low relevance; unscored events are not low", () => {
    expect(isLowRelevance(24)).toBe(true);
    expect(isLowRelevance(25)).toBe(false);
    expect(isLowRelevance(null)).toBe(false);
  });

  it("shows one row per event name, the soonest date", () => {
    const rows = onePerTitle([ev("Panto", "2026-11-20"), ev("panto ", "2026-11-14"), ev("Quiz", "2026-11-15")]);
    expect(rows.map((r) => r.start_date)).toEqual(["2026-11-14", "2026-11-15"]);
  });

  it("mentions out-of-area events in the preview only when there are some", () => {
    expect(hiddenSentence(0)).toBeNull();
    expect(hiddenSentence(1)).toBe("1 out-of-area event goes straight to Hidden.");
    expect(hiddenSentence(3)).toBe("3 out-of-area events go straight to Hidden.");
  });
});
