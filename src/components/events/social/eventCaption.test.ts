// @ts-nocheck -- run with: bun test ./src/components/events/social/eventCaption.test.ts
import { describe, expect, it } from "bun:test";
import { eventCaption } from "./eventCaption";

describe("event social caption", () => {
  const e = { title: "Fado at Alfama", start_date: "2026-11-21", start_time: "20:00:00", location: "Clube de Fado", price: "15", is_free: false, description: "An intimate night of fado." };
  it("leads with the title and lists date, venue and price on one line", () => {
    const lines = eventCaption(e, { feedName: "Whats on Lisbon", feedUrl: "curatr.pro/feed/lisbon", currency: "EUR" }).split("\n\n");
    expect(lines[0]).toBe("Fado at Alfama");
    expect(lines[1]).toContain("Clube de Fado");
    expect(lines[1]).toContain("8pm");
    expect(lines[1]).toContain("€");
  });
  it("ends with where to find more", () => {
    expect(eventCaption(e, { feedName: "Whats on Lisbon", feedUrl: "curatr.pro/feed/lisbon" }).endsWith("More on Whats on Lisbon: curatr.pro/feed/lisbon")).toBe(true);
  });
});
