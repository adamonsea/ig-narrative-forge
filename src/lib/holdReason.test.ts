import { describe, expect, it } from "vitest";
import { holdReasonTag } from "./holdReason";

describe("holdReasonTag", () => {
  it("shows the score against the Autopilot bar when it fell short", () => {
    expect(holdReasonTag({ qualityScore: 73, autopilotBar: 75 })?.label).toBe("73% · needs 75%");
  });

  it("names the locality hold when no place was found", () => {
    expect(holdReasonTag({ heldReason: "No place named — held for review", qualityScore: 78, autopilotBar: 75 })?.label).toBe("No place named");
  });

  it("names a nearby place hold", () => {
    expect(holdReasonTag({ heldReason: "Nearby (Hailsham)", qualityScore: 80, autopilotBar: 75 })?.label).toBe("Nearby");
  });

  it("shows no tag when Autopilot is off", () => {
    expect(holdReasonTag({ heldReason: "No place named — held for review", qualityScore: 40, autopilotBar: null })).toBeNull();
  });

  it("shows no tag for an article that clears the bar and wasn't held", () => {
    expect(holdReasonTag({ qualityScore: 80, autopilotBar: 75 })).toBeNull();
  });
});
