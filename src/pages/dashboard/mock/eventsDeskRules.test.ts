// @ts-nocheck -- run with: bun test ./src/pages/dashboard/mock/eventsDeskRules.test.ts
import { describe, expect, it } from "bun:test";
import { coverSentence, detectSourceKind, eventGroup, upcomingWhatsOn, whatsOnPositions, signupPositions, type MockEvent } from "./eventsDeskRules";

const ev = (id: string, date: string, time: string | null = "19:00"): MockEvent =>
  ({ id, title: id, date, time, venue: "v", sourceName: "s", sourceUrl: "https://x" });

// Thursday 12 Nov 2026
const THU = "2026-11-12";

describe("What's on card contents", () => {
  it("keeps at most 8 events from the next 14 days, soonest first, dropping past ones", () => {
    const events = [ev("past", "2026-11-11"), ev("far", "2026-11-26"), ...Array.from({ length: 10 }, (_, i) => ev(`e${9 - i}`, `2026-11-${String(21 - i).padStart(2, "0")}`))];
    const out = upcomingWhatsOn(events, THU);
    expect(out.length).toBe(8);
    expect(out[0].date).toBe(THU);
    expect(out.map((e) => e.id)).not.toContain("past");
    expect(out.map((e) => e.id)).not.toContain("far");
  });

  it("groups as Tonight / This weekend / Next week", () => {
    expect(eventGroup(ev("a", THU, "20:00"), THU)).toBe("Tonight");
    expect(eventGroup(ev("b", "2026-11-14"), THU)).toBe("This weekend");
    expect(eventGroup(ev("c", "2026-11-18"), THU)).toBe("Next week");
  });

  it("cover names the first two events then the rest as a count", () => {
    const events = [ev("Jazz at The Lamb", THU, "20:00"), ev("The Nutcracker", "2026-11-14"), ...[1, 2, 3, 4, 5, 6].map((n) => ev(`x${n}`, "2026-11-20"))];
    expect(coverSentence(events, THU)).toBe("Tonight: Jazz at The Lamb · Sat: The Nutcracker + 6 more");
  });
});

describe("What's on placement", () => {
  it("first screenful, then no more often than every 15 stories", () => {
    expect(whatsOnPositions(40, [])).toEqual([1, 16, 31]);
  });
  it("never sits beside another extra card", () => {
    const signup = signupPositions(40); // [3, 13, 28]
    expect(signup).toEqual([3, 13, 28]);
    expect(whatsOnPositions(40, [1, 16])).toEqual([2, 17, 32]);
    for (const p of whatsOnPositions(40, signup)) expect(signup).not.toContain(p);
  });
});

describe("source kind detection", () => {
  it("detects RSS, calendar feeds and what's-on pages from the link", () => {
    expect(detectSourceKind("https://bournefree.co.uk/feed/")).toBe("rss");
    expect(detectSourceKind("https://members.eastbourneunltd.co.uk/ajax_website/ajax_retrieveevents.php")).toBe("calendar_feed");
    expect(detectSourceKind("https://example.org/events.ics")).toBe("calendar_feed");
    expect(detectSourceKind("https://www.eastbournetheatres.co.uk/whats-on")).toBe("whats_on_page");
    expect(detectSourceKind("https://www.lewes-eastbourne.gov.uk/news")).toBe("website");
  });
});
