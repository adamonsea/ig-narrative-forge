// run with: bun test ./src/lib/eventDescription.test.ts
import { describe, expect, it } from "bun:test";
import { completeDescription } from "./eventDescription";

describe("event descriptions read as finished thoughts", () => {
  it("a short description shows in full", () => {
    expect(completeDescription("An evening of fado at the old theatre.")).toBe("An evening of fado at the old theatre.");
  });
  it("a long description stops at the last whole sentence within 220 characters", () => {
    const a = "A night of jazz standards with the Lisbon Big Band, joined by guest singers from across Portugal.";
    const b = "Doors open at seven and the bar serves local wine all evening.";
    const c = "Tickets are limited and the last three shows sold out within hours of going on sale, so book early to avoid disappointment.";
    expect(completeDescription(`${a} ${b} ${c}`)).toBe(`${a} ${b}`);
  });
  it("one very long sentence ends on a whole word with an ellipsis", () => {
    const out = completeDescription("word ".repeat(80));
    expect(out!.endsWith("word…")).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(220);
  });
  it("abbreviations like Dr. don't count as a sentence end", () => {
    const text = `Talk by Dr. Silva on coastal birds and how the estuary has changed over fifty years of careful watching by volunteers. ${"More detail follows here. ".repeat(10)}`;
    expect(completeDescription(text)!.startsWith("Talk by Dr. Silva on coastal birds and how the estuary has changed over fifty years of careful watching by volunteers.")).toBe(true);
  });
  it("empty text gives nothing", () => {
    expect(completeDescription("   ")).toBe(null);
  });
});
