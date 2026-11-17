// @ts-nocheck -- run with: bun test ./src/lib/illustrationGate.test.ts
import { describe, expect, it } from "bun:test";
import { isLiveStory, needsPublishIllustration } from "../../supabase/functions/_shared/illustration-gate.ts";

describe("paid pictures wait for publication", () => {
  it("a draft never gets an automatic picture", () => {
    expect(isLiveStory({ status: "draft", is_published: false })).toBe(false);
  });
  it("a ready (drip) story waits until it's published", () => {
    expect(isLiveStory({ status: "ready", is_published: false })).toBe(false);
  });
  it("published status without the published flag is not live", () => {
    expect(isLiveStory({ status: "published", is_published: false })).toBe(false);
  });
  it("a published, live story without a picture gets one on publish", () => {
    expect(needsPublishIllustration({ status: "published", is_published: true, cover_illustration_url: null })).toBe(true);
  });
  it("a story that already has a picture isn't drawn again on publish", () => {
    expect(needsPublishIllustration({ status: "published", is_published: true, cover_illustration_url: "https://x/y.webp" })).toBe(false);
  });
});
