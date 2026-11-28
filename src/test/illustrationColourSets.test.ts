import { describe, it, expect } from "vitest";
import { COLOUR_SETS, pickColourSet, inkRoles } from "@/lib/illustrationColourSets";

describe("illustration colour sets", () => {
  it("has the eleven sets with hex codes", () => expect(COLOUR_SETS).toHaveLength(11));
  it("uses the chosen set", () => expect(pickColourSet("teal-mustard").colours).toEqual(["#0F7476", "#DFAF34"]));
  it("random picks a whole set, from all of them", () => {
    expect(pickColourSet("random", () => 0)).toBe(COLOUR_SETS[0]);
    expect(pickColourSet("random", () => 0.999)).toBe(COLOUR_SETS[10]);
  });
  it("every role colour comes from the same set", () => {
    for (const set of COLOUR_SETS) {
      const r = inkRoles(set);
      for (const c of [r.accent, ...(r.ink ? [r.ink] : []), ...r.others]) expect(set.colours).toContain(c);
    }
  });
});
