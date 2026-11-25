import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, shapeEvent, type RawEvent } from "@/lib/feedApi/events";

const raw: RawEvent = { id: "1", title: "T", description: null, start_date: "2026-11-25", start_time: "19:00:00", run_start: null, end_date: null, location: null, category: null, price: null, is_free: null, source_name: "agendalx.pt", source_url: null, image_path: null, image_source_url: null };

describe("feed api events", () => {
  it("has no image unless the database released one", () => {
    expect(shapeEvent(raw, "x").image).toBeUndefined();
    expect(shapeEvent({ ...raw, image_path: "a/events/b.webp" }, "x").image?.credit).toBe("agendalx.pt");
  });
  it("cursor round-trips the offset", () => {
    expect(decodeCursor(encodeCursor(40))).toBe(40);
    expect(decodeCursor("nonsense")).toBeNull();
  });
});
