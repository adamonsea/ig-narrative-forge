// @ts-nocheck -- run with: bun test ./src/lib/liveNow.test.ts
import { describe, expect, it } from "bun:test";
import { groupHeld, isRepeatOfLive, splitLiveNow, staleHeld } from "./liveNow";

const NOW = Date.parse("2026-11-17T09:00:00Z");
const base = { is_published: true, topic_article_id: "ta", article_published_at: null };

describe("Live now mirrors the feed", () => {
  it("keeps only published (or published-flag ready) feed stories", () => {
    const { live, held } = splitLiveNow([
      { ...base, id: "a", status: "published", created_at: "2026-11-17T08:00:00Z" },
      { ...base, id: "b", status: "ready", created_at: "2026-11-17T07:00:00Z" },
      { ...base, id: "c", status: "draft", created_at: "2026-11-17T06:00:00Z", is_published: false },
      { ...base, id: "d", status: "ready", created_at: "2026-11-17T05:00:00Z", is_published: false },
      { ...base, id: "e", status: "published", created_at: "2026-11-17T04:00:00Z", topic_article_id: null },
      { ...base, id: "f", status: "archived", created_at: "2026-11-17T03:00:00Z", is_published: false },
    ], NOW);
    expect(live.map((s) => s.id)).toEqual(["a", "b"]);
    expect(held.map((s) => s.id)).toEqual(["c", "d", "e"]);
  });

  it("orders by display date (older originals slot back in), then id", () => {
    const { live } = splitLiveNow([
      { ...base, id: "old-original", status: "published", created_at: "2026-11-17T08:30:00Z", article_published_at: "2026-11-01T10:00:00Z" },
      { ...base, id: "b", status: "published", created_at: "2026-11-16T10:00:00Z" },
      { ...base, id: "c", status: "published", created_at: "2026-11-16T10:00:00Z" },
      { ...base, id: "new", status: "published", created_at: "2026-11-17T08:00:00Z" },
    ], NOW);
    expect(live.map((s) => s.id)).toEqual(["new", "c", "b", "old-original"]);
  });

  it("leaves out stories whose display date is still in the future", () => {
    const { live } = splitLiveNow([{ ...base, id: "x", status: "published", created_at: "2026-11-17T10:00:00Z" }], NOW);
    expect(live).toEqual([]);
  });
});

describe("stale written stories", () => {
  const held = (id, created_at, extra = {}) => ({ ...base, id, status: "draft", is_published: false, created_at, ...extra });
  it("a draft written 8 days ago is stale", () => {
    expect(staleHeld([held("a", "2026-11-09T08:00:00Z")], NOW).map((s) => s.id)).toEqual(["a"]);
  });
  it("a draft written 6 days ago is not stale", () => {
    expect(staleHeld([held("b", "2026-11-11T09:00:00Z")], NOW)).toEqual([]);
  });
  it("an old story scheduled for later is not stale", () => {
    expect(staleHeld([held("c", "2026-10-28T09:00:00Z", { status: "ready", scheduled_publish_at: "2026-11-18T09:00:00Z" })], NOW)).toEqual([]);
  });
});

describe("Story pool groups", () => {
  const s = (id, status, created_at, extra = {}) => ({ ...base, id, status, is_published: false, created_at, ...extra });
  it("a draft from 2 days ago needs the owner's OK", () => {
    expect(groupHeld([s("a", "draft", "2026-11-15T09:00:00Z")], NOW).toCheck.map((x) => x.id)).toEqual(["a"]);
  });
  it("a draft whose release time has passed still needs the owner's OK", () => {
    expect(groupHeld([s("b", "draft", "2026-11-16T09:00:00Z", { scheduled_publish_at: "2026-11-17T06:00:00Z" })], NOW).toCheck.map((x) => x.id)).toEqual(["b"]);
  });
  it("a ready story is queued, not waiting for an OK", () => {
    const g = groupHeld([s("c", "ready", "2026-11-17T08:00:00Z", { scheduled_publish_at: "2026-11-17T18:00:00Z" })], NOW);
    expect(g.queued.map((x) => x.id)).toEqual(["c"]);
    expect(g.toCheck).toEqual([]);
  });
  it("a draft over a week old is not asked about", () => {
    const g = groupHeld([s("d", "draft", "2026-11-09T08:00:00Z")], NOW);
    expect(g.toCheck).toEqual([]);
    expect(g.other.map((x) => x.id)).toEqual(["d"]);
  });
});

describe("repeats of live stories", () => {
  const live = ["Eastbourne primary pupils get hands-on introduction to careers in construction"];
  it("the same headline counts as a repeat", () => {
    expect(isRepeatOfLive("Eastbourne primary pupils get hands-on introduction to careers in construction", live)).toBe(true);
  });
  it("a different story about pupils is not a repeat", () => {
    expect(isRepeatOfLive("Pupils in Eastbourne school turn £10 into £4,000 for foodbank", live)).toBe(false);
  });
});
