// @ts-nocheck -- run with: bun test ./src/lib/illustrationGate.test.ts
import { describe, expect, it } from "bun:test";
import { feedAllowsAutoPictures, isLiveStory, needsPublishIllustration } from "../../supabase/functions/_shared/illustration-gate.ts";

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

describe("owner's no-picture choices win on publish", () => {
  it("a story with 'make picture' turned off gets no picture when it goes live", () => {
    expect(needsPublishIllustration({ status: "published", is_published: true, cover_illustration_url: null, skip_auto_illustration: true })).toBe(false);
  });
  it("Autopilot with pictures off allows no automatic pictures", () => {
    expect(feedAllowsAutoPictures({ automation_mode: "holiday", auto_illustrate_in_holiday: false })).toBe(false);
  });
  it("Autopilot with pictures on (or unset) still draws", () => {
    expect(feedAllowsAutoPictures({ automation_mode: "holiday", auto_illustrate_in_holiday: true })).toBe(true);
    expect(feedAllowsAutoPictures({ automation_mode: "holiday", auto_illustrate_in_holiday: null })).toBe(true);
  });
});
