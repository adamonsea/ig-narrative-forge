// @ts-nocheck -- runs under bun (bun test) and is pure TS
import { describe, expect, it } from "bun:test";
import { eventsCtaText, firstWidgetTab, parseWidgetContent, resolveWidgetContent } from "./widgetContent.ts";

const mixed = { eventsLed: false, eventsShown: true, storyCount: 12, eventCount: 30 };
const eventsOnly = { eventsLed: true, eventsShown: true, storyCount: 0, eventCount: 40 };
const newsOnly = { eventsLed: false, eventsShown: false, storyCount: 12, eventCount: 0 };

describe("widget content", () => {
  it("unknown or missing values mean auto", () => {
    expect(parseWidgetContent(undefined)).toBe("auto");
    expect(parseWidgetContent("<script>")).toBe("auto");
    expect(parseWidgetContent("both")).toBe("both");
  });

  it("auto keeps news-led feeds on news, so existing embeds don't change", () => {
    expect(resolveWidgetContent("auto", mixed)).toBe("stories");
    expect(resolveWidgetContent("auto", newsOnly)).toBe("stories");
  });

  it("auto shows events on an events-led feed (no more empty Lisbon widget)", () => {
    expect(resolveWidgetContent("auto", eventsOnly)).toBe("events");
  });

  it("auto on an events-led feed with nothing upcoming shows the events empty state", () => {
    expect(resolveWidgetContent("auto", { ...eventsOnly, eventCount: 0 })).toBe("events");
  });

  it("both shows tabs only when there are news and events", () => {
    expect(resolveWidgetContent("both", mixed)).toBe("both");
    expect(resolveWidgetContent("both", eventsOnly)).toBe("events");
    expect(resolveWidgetContent("both", newsOnly)).toBe("stories");
  });

  it("events falls back to news rather than an empty widget", () => {
    expect(resolveWidgetContent("events", mixed)).toBe("events");
    expect(resolveWidgetContent("events", newsOnly)).toBe("stories");
  });

  it("events hidden from the feed are never shown in its widget", () => {
    expect(resolveWidgetContent("events", { ...mixed, eventsShown: false })).toBe("stories");
    expect(resolveWidgetContent("both", { ...mixed, eventsShown: false })).toBe("stories");
  });

  it("news falls back to events on a feed with no stories", () => {
    expect(resolveWidgetContent("stories", eventsOnly)).toBe("events");
    expect(resolveWidgetContent("stories", mixed)).toBe("stories");
  });

  it("the first tab follows the feed's lead", () => {
    expect(firstWidgetTab(true)).toBe("events");
    expect(firstWidgetTab(false)).toBe("stories");
  });

  it("footer wording counts upcoming events", () => {
    expect(eventsCtaText(0, 50)).toBe("See what's on →");
    expect(eventsCtaText(1, 50)).toBe("1 event coming up →");
    expect(eventsCtaText(18, 50)).toBe("18 events coming up →");
    expect(eventsCtaText(50, 50)).toBe("50+ events coming up →");
  });
});
