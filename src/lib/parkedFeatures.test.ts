// @ts-nocheck -- run with: bun test ./src/lib/parkedFeatures.test.ts
import { describe, expect, test } from "bun:test";
import { FEATURES } from "./featureFlags";

// Parked 13 Nov 2026 (docs/parked-features.md). Flipping one back on is a
// deliberate product decision: update this test in the same change.
describe("parked features stay switched off", () => {
  for (const name of ["communityDiscussion", "parliament", "sentiment", "emailSegments", "audioBriefings", "familySafe"]) {
    test(`${name} is off`, () => expect(FEATURES[name]).toBe(false));
  }
});
