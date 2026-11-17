// @ts-nocheck -- runs under bun (bun test) and is pure TS
import { describe, expect, it } from "bun:test";
import { categorizeEvent, categoryFromHint, priceFacts, shortDescription, suggestEventCategory } from "./eventCategories.ts";

describe("event categories by rules", () => {
  it("the listing's own category wins", () => {
    expect(categorizeEvent({ title: "Noite de sábado", hint: "MusicEvent" })).toBe("music");
  });
  it("a generic listing label falls through to keywords", () => {
    expect(categoryFromHint("Events")).toBeNull();
    expect(categorizeEvent({ title: "Fado at the Clube", hint: "Events" })).toBe("music");
  });
  it("comedy is spotted before music once the feed has added Comedy", () => {
    expect(categorizeEvent({ title: "Stand-up comedy night with live band" }, ["comedy"])).toBe("comedy");
  });
  it("spare categories stay out until the feed adds them", () => {
    expect(categorizeEvent({ title: "Stand-up comedy night with live band" })).toBe("music");
    expect(categorizeEvent({ title: "Stand-up comedy" })).toBe("other");
  });
  it("a broad 'arts' label loses to clear words in the title", () => {
    expect(categorizeEvent({ title: "Jazz concert at the castle", hint: "arts" })).toBe("music");
    expect(categorizeEvent({ title: "Untitled evening", hint: "arts" })).toBe("arts-theatre");
  });
  it("nothing matching is Other", () => {
    expect(categorizeEvent({ title: "Annual general meeting" })).toBe("other");
  });
});

describe("category suggestions", () => {
  const comedy = Array.from({ length: 8 }, (_, i) => ({ title: `Stand-up show ${i}` }));
  it("8 matching Other events suggest the category", () => {
    expect(suggestEventCategory(comedy, [])).toEqual({ category: "comedy", count: 8 });
  });
  it("7 are not enough", () => {
    expect(suggestEventCategory(comedy.slice(0, 7), [])).toBeNull();
  });
  it("a skipped or added category is not suggested again", () => {
    expect(suggestEventCategory(comedy, ["comedy"])).toBeNull();
  });
});

describe("price facts", () => {
  it("free only when the source says so", () => {
    expect(priceFacts({ price: 0, priceCurrency: "EUR" })).toEqual({ price: null, is_free: true });
    expect(priceFacts(undefined, true)).toEqual({ price: null, is_free: true });
  });
  it("a stated price is shown with its currency", () => {
    expect(priceFacts({ price: "12", priceCurrency: "EUR" })).toEqual({ price: "€12", is_free: false });
  });
  it("no offer means unknown, never free", () => {
    expect(priceFacts(undefined)).toEqual({ price: null, is_free: null });
  });
});

describe("short description", () => {
  it("drops ticket boilerplate", () => {
    expect(shortDescription("<p>A night of jazz by the river. Buy tickets now at the box office</p>")).toBe("A night of jazz by the river.");
  });
});
