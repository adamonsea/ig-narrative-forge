import { describe, expect, it } from "vitest";
import { readerMismatches } from "@/lib/readerConsistency";

const row = (card: number, tab: number) => ({ topic_id: `${card}-${tab}`, name: "f", card_readers: card, tab_readers: tab, page_loads: 99 });

describe("reader consistency", () => {
  it("flags a feed whose card and Readers tab differ", () => expect(readerMismatches([row(23, 22)])).toHaveLength(1));
  it("passes when they match, whatever the page loads", () => expect(readerMismatches([row(23, 23)])).toHaveLength(0));
});
