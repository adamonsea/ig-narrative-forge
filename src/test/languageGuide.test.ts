import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_SUMMARY_TAG, OWNER_LINE, READER_LINE } from "@/lib/howCuratrWorks";

const BANNED = [/AI-powered/i, /AI-written/i, /\brewritten\b/i, /auto-generated/i, /AI illustrations/i, /AI briefings/i, /\bagentic\b/i, /trusted sources/i, /AI journalism/i];
const FILES = [
  "src/components/features/featureCatalog.ts",
  "src/routes/__root.tsx",
  "src/components/seo/GlobalSEO.tsx",
  "src/pages/Pricing.tsx",
  "supabase/functions/_shared/waitlist-email.ts",
];

describe("language guide", () => {
  for (const file of FILES) {
    it(`${file} has no banned phrases`, () => {
      const text = readFileSync(file, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      for (const re of BANNED) expect(text, `${re} in ${file}`).not.toMatch(re);
    });
  }
  it("honest lines use house style (no em dashes)", () => {
    for (const line of [READER_LINE, OWNER_LINE, AI_SUMMARY_TAG]) expect(line).not.toContain("—");
  });
  it("reader line never claims a person checked the story", () => {
    expect(READER_LINE).not.toMatch(/checked/i);
  });
});
