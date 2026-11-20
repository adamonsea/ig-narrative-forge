import { describe, expect, it } from "bun:test";
import { clampFraming, cropRect, eventFramedPath, isFramedCover, isFramedPublisherCover, outputSize, ownStoryFilePath, panBy, readFraming, storyFramedPath } from "./pictureFrame";
import { isStoredEventPhoto } from "./eventPhotoPath";

const T = "11111111-1111-1111-1111-111111111111";
const S = "22222222-2222-2222-2222-222222222222";
const base = "https://x.supabase.co/storage/v1/object/public/topic-assets/";

describe("cropRect", () => {
  it("centred 3:2 crop of a square picture uses the full width", () => {
    expect(cropRect(1200, 1200, 1.5, { x: 0.5, y: 0.5, zoom: 1 })).toEqual({ sx: 0, sy: 200, sw: 1200, sh: 800 });
  });
  it("never leaves the picture when moved past the edge", () => {
    const r = cropRect(1000, 500, 1, { x: 0, y: 0.5, zoom: 1 });
    expect(r.sx).toBe(0);
    expect(r.sw).toBe(500);
  });
  it("zoom 2 halves the crop", () => {
    expect(cropRect(1000, 1000, 1, { x: 0.5, y: 0.5, zoom: 2 }).sw).toBe(500);
  });
});

describe("panBy", () => {
  it("dragging right shows more of the left", () => {
    const f = panBy(2000, 1000, 1, { x: 0.5, y: 0.5, zoom: 1 }, 100, 0, 500);
    expect(f.x).toBeLessThan(0.5);
  });
  it("stops at the edge", () => {
    expect(clampFraming(2000, 1000, 1, { x: -1, y: 0.5, zoom: 1 }).x).toBe(0.25);
  });
});

describe("outputSize", () => {
  it("never upscales and keeps the frame shape", () => {
    expect(outputSize({ sx: 0, sy: 0, sw: 600, sh: 400 }, 1.5, 1536)).toEqual({ width: 600, height: 400 });
    expect(outputSize({ sx: 0, sy: 0, sw: 3000, sh: 2000 }, 1.5, 1536)).toEqual({ width: 1536, height: 1024 });
  });
});

describe("readFraming", () => {
  it("accepts saved framing and rejects junk", () => {
    expect(readFraming({ x: 0.2, y: 0.8, zoom: 1.5 })).toEqual({ x: 0.2, y: 0.8, zoom: 1.5 });
    expect(readFraming({ x: "a" })).toBeNull();
    expect(readFraming(null)).toBeNull();
  });
});

describe("file names", () => {
  it("framed event photos are shown like gathered ones", () => {
    expect(isStoredEventPhoto(eventFramedPath(T, S, 1700000000000, "webp"))).toBe(true);
    expect(isStoredEventPhoto(`${T}/events/${S}-src1700000000000.webp`)).toBe(false);
  });
  it("a framed publisher photo keeps its credit, an owner picture does not", () => {
    expect(isFramedPublisherCover(base + storyFramedPath(T, S, true, 1, "webp"))).toBe(true);
    expect(isFramedPublisherCover(base + storyFramedPath(T, S, false, 1, "webp"))).toBe(false);
  });
  it("recognises the editor's own story files", () => {
    expect(ownStoryFilePath(base + storyFramedPath(T, S, false, 5, "jpg"))).toBe(`${T}/stories/${S}/cover-5.jpg`);
    expect(isFramedCover(base + `${T}/stories/${S}/src-5.jpg`)).toBe(false);
    expect(isFramedCover("https://news.example.com/a.jpg")).toBe(false);
  });
});

describe("photo credit on framed covers", () => {
  it("a framed publisher photo is still credited as the publisher's", async () => {
    const { isPublisherPhoto } = await import("./photoCredit");
    expect(isPublisherPhoto(base + storyFramedPath(T, S, true, 1, "webp"), ["x.supabase.co"])).toBe(true);
    expect(isPublisherPhoto(base + storyFramedPath(T, S, false, 1, "webp"), ["x.supabase.co"])).toBe(false);
  });
});
