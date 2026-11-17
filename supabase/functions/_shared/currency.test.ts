// @ts-nocheck -- runs under bun (bun test) and is pure TS
import { describe, expect, it } from "bun:test";
import { currencyFromUrls, feedCurrency, formatPrice, tidyPrice } from "./currency.ts";

describe("feed currency", () => {
  it("Lisbon sources give €, UK sources give £", () => {
    expect(currencyFromUrls(["https://www.agendalx.pt/?lang=en"])).toBe("EUR");
    expect(currencyFromUrls(["https://www.eventbrite.co.uk/d/united-kingdom--eastbourne/events"])).toBe("GBP");
  });
  it("addresses without a country don't decide; the first that has one does", () => {
    expect(currencyFromUrls(["https://example.com", "https://www.dlwp.com/"])).toBeNull();
    expect(currencyFromUrls(["https://example.com", "https://www.agendalx.pt/"])).toBe("EUR");
  });
  it("the owner's choice wins, else sources, else £", () => {
    expect(feedCurrency("USD", ["https://www.agendalx.pt/"])).toBe("USD");
    expect(feedCurrency(null, ["https://www.agendalx.pt/"])).toBe("EUR");
    expect(feedCurrency(null, ["https://example.com"])).toBe("GBP");
  });
});

describe("prices", () => {
  it("shows €12 or Free; hides when there's no price", () => {
    expect(formatPrice("12", false, "EUR")).toBe("€12");
    expect(formatPrice(null, true, "EUR")).toBe("Free");
    expect(formatPrice(null, null, "EUR")).toBeNull();
    expect(formatPrice("", false, "GBP")).toBeNull();
  });
  it("a bare amount with no currency stays hidden", () => {
    expect(formatPrice("12", false, null)).toBeNull();
  });
  it("ranges and From prices take the feed's currency", () => {
    expect(formatPrice("15–20", false, "EUR")).toBe("€15–20");
    expect(formatPrice("From 8.50", false, "GBP")).toBe("From £8.50");
  });
  it("prices the listing already wrote with a symbol stay as written", () => {
    expect(formatPrice("€12", false, "GBP")).toBe("€12");
  });
  it("listing price text is tidied for storage", () => {
    expect(tidyPrice("4")).toEqual({ price: "4", is_free: false });
    expect(tidyPrice("15 € to 20")).toEqual({ price: "€15–20", is_free: false });
    expect(tidyPrice("4,50")).toEqual({ price: "4.50", is_free: false });
    expect(tidyPrice("0")).toEqual({ price: null, is_free: true });
    expect(tidyPrice("Grátis")).toEqual({ price: null, is_free: true });
    expect(tidyPrice("Pay what you can")).toEqual({ price: "Pay what you can", is_free: false });
    expect(tidyPrice("")).toEqual({ price: null, is_free: null });
  });
});
