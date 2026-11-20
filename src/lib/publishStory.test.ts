// run with: bun test ./src/lib/publishStory.test.ts
import { describe, expect, it } from "bun:test";
import { publishNowUpdate } from "./publishStory";
import { needsPublishIllustration } from "../../supabase/functions/_shared/illustration-gate.ts";

const NOW = "2026-11-20T09:00:00.000Z";

describe("Publish without picture", () => {
  it("a story published without picture gets no automatic picture", () => {
    const live = { ...publishNowUpdate(NOW, { withPicture: false }), cover_illustration_url: null };
    expect(live.skip_auto_illustration).toBe(true);
    expect(needsPublishIllustration(live)).toBe(false);
  });
  it("a story published normally still gets its picture", () => {
    const live = { ...publishNowUpdate(NOW), cover_illustration_url: null };
    expect(needsPublishIllustration(live)).toBe(true);
  });
  it("publishing normally never clears an earlier no-picture choice", () => {
    expect("skip_auto_illustration" in publishNowUpdate(NOW, { withPicture: true })).toBe(false);
  });
  it("both ways put the story live now", () => {
    for (const u of [publishNowUpdate(NOW), publishNowUpdate(NOW, { withPicture: false })]) {
      expect(u.status).toBe("published");
      expect(u.is_published).toBe(true);
      expect(u.published_at).toBe(NOW);
      expect(u.scheduled_publish_at).toBeNull();
    }
  });
});
