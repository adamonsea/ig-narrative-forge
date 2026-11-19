// run with: bun test ./src/lib/ticketPlatforms.test.ts
import { describe, expect, it } from "bun:test";
import { isOrganiserShop, ticketPlatformOf } from "./ticketPlatforms";

describe("ticket platforms in Add source", () => {
  it("knows the platform's own site from an organiser's shop", () => {
    expect(ticketPlatformOf("www.onlineticketseller.com")?.label).toBe("Online Ticket Seller");
    expect(isOrganiserShop("www.onlineticketseller.com")).toBe(false);
    expect(isOrganiserShop("https://onlineticketseller.com")).toBe(false);
    expect(isOrganiserShop("https://grovetheatre.onlineticketseller.com/events/1")).toBe(true);
  });
  it("ignores other sites", () => {
    expect(ticketPlatformOf("https://www.eastbournetheatres.co.uk/whats-on")).toBe(null);
    expect(isOrganiserShop("https://grovetheatre.co.uk")).toBe(false);
  });
});
