// run with: bun test ./src/lib/eventCalendar.test.ts
import { describe, expect, it } from "bun:test";
import { buildIcs } from "./eventCalendar";
import { eventLinkKind } from "./eventClicks";

const now = new Date(Date.UTC(2026, 10, 20, 12));
const base = { id: "e1", title: "Panto: Dick Whittington", start_date: "2026-12-05" };

describe("Add to calendar file", () => {
  it("timed events start at the listing's time and last 2 hours", () => {
    const ics = buildIcs({ ...base, start_time: "19:30:00" }, now);
    expect(ics).toContain("DTSTART:20261205T193000");
    expect(ics).toContain("DTEND:20261205T213000");
  });
  it("late events roll into the next day", () => {
    expect(buildIcs({ ...base, start_time: "23:00" }, now)).toContain("DTEND:20261206T010000");
  });
  it("untimed events are all-day", () => {
    const ics = buildIcs(base, now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261205");
    expect(ics).toContain("DTEND;VALUE=DATE:20261206");
  });
  it("keeps the listing's link and escapes commas", () => {
    const ics = buildIcs({ ...base, location: "Royal Hippodrome, Eastbourne", source_url: "https://example.org/panto" }, now);
    expect(ics).toContain("LOCATION:Royal Hippodrome\\, Eastbourne");
    expect(ics).toContain("URL:https://example.org/panto");
  });
});

describe("event link kind", () => {
  it("priced, not free = tickets", () => expect(eventLinkKind({ price: "£12", is_free: false })).toBe("tickets"));
  it("free or no price = details", () => {
    expect(eventLinkKind({ price: "Free", is_free: true })).toBe("details");
    expect(eventLinkKind({})).toBe("details");
  });
});
