// run with: bun test ./src/lib/storyCoverStyle.test.ts
import { describe, expect, it } from "bun:test";
import { resolveStoryCoverStyle, STORY_COVER_LABELS, STORY_COVER_STYLES } from "./storyCoverStyle";

describe("resolveStoryCoverStyle", () => {
  it("keeps the two styles the owner can pick", () => {
    expect(STORY_COVER_STYLES).toEqual(["split", "full-bleed"]);
    expect(Object.keys(STORY_COVER_LABELS)).toEqual(["split", "full-bleed"]);
  });

  it("uses the full-bleed cover only when that is what was saved", () => {
    expect(resolveStoryCoverStyle("full-bleed")).toBe("full-bleed");
  });

  it("falls back to split for anything else, so an old feed never shows an unchosen cover", () => {
    for (const raw of [null, undefined, "", "split", "fullbleed", "Full-Bleed", 0, {}]) {
      expect(resolveStoryCoverStyle(raw)).toBe("split");
    }
  });
});
