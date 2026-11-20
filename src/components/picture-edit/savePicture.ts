/**
 * Saving an edited picture: load the uncropped original, draw the owner's frame
 * on a canvas, store the result in topic-assets and point the story or event at
 * it. Every surface then shows the new file; the event social poster and story
 * reel redraw from it the next time they're opened.
 */
import { supabase } from "@/integrations/supabase/client";
import { isPublisherPhoto } from "@/lib/photoCredit";
import {
  type Framing, MAX_OUTPUT_WIDTH, cropRect, eventFramedPath, eventSourcePath, isFramedCover, outputSize,
  ownStoryFilePath, storyFramedPath, storySourcePath,
} from "@/lib/pictureFrame";

const BUCKET = "topic-assets";
const ORIGINAL_MAX_WIDTH = 2400;
const SUPABASE_HOST = (() => {
  try { return new URL(import.meta.env["VITE_SUPABASE_URL"] || "").hostname; } catch { return ""; }
})();

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MIN_PICTURE_WIDTH = 400;

const isOwnStorage = (url: string) => {
  try { return Boolean(SUPABASE_HOST) && new URL(url).hostname === SUPABASE_HOST; } catch { return false; }
};

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't open the picture")); };
    img.src = url;
  });
}

/** The picture behind a story cover, as bytes the browser may draw. Publisher photos come through our server. */
export async function fetchStorySource(storyId: string, url: string): Promise<Blob> {
  if (isOwnStorage(url)) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Picture unavailable");
    return res.blob();
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Signed out");
  const res = await fetch("/api/picture-source", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ storyId }),
  });
  if (!res.ok) throw new Error("Picture unavailable");
  return res.blob();
}

export async function fetchStoredFile(path: string): Promise<Blob> {
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Picture unavailable");
  return res.blob();
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** WebP where the browser can make it, otherwise JPEG. */
async function encode(canvas: HTMLCanvasElement): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const webp = await toBlob(canvas, "image/webp", 0.88);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpg = await toBlob(canvas, "image/jpeg", 0.88);
  if (!jpg) throw new Error("Couldn't make the picture");
  return { blob: jpg, ext: "jpg" };
}

/** The owner's frame as a finished picture. */
export async function renderFramed(img: HTMLImageElement, aspect: number, framing: Framing, maxWidth: number) {
  const crop = cropRect(img.naturalWidth, img.naturalHeight, aspect, framing);
  const { width, height } = outputSize(crop, aspect, maxWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  return encode(canvas);
}

/** A replacement picture, uncropped (capped in size), kept for reframing later. */
async function renderOriginal(img: HTMLImageElement) {
  const scale = Math.min(1, ORIGINAL_MAX_WIDTH / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return encode(canvas);
}

async function upload(path: string, blob: Blob): Promise<string> {
  const store = supabase.storage.from(BUCKET);
  const { error } = await store.upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return store.getPublicUrl(path).data.publicUrl;
}

export interface StoryPictureSave {
  storyId: string;
  topicId: string;
  img: HTMLImageElement;
  framing: Framing;
  aspect: number;
  /** True when the owner chose a new picture instead of reframing. */
  replaced: boolean;
  currentCover: string | null;
  /** The uncropped picture being framed (null when replaced). */
  originalUrl: string | null;
  previousOriginal: string | null;
  hasAnimation: boolean;
}

export async function saveStoryPicture(s: StoryPictureSave): Promise<string> {
  const ts = Date.now();
  let original = s.originalUrl;
  if (s.replaced || !original) {
    const o = await renderOriginal(s.img);
    original = await upload(storySourcePath(s.topicId, s.storyId, ts, o.ext), o.blob);
  }
  const publisher = !s.replaced && isPublisherPhoto(original);
  const framed = await renderFramed(s.img, s.aspect, s.framing, MAX_OUTPUT_WIDTH.story);
  const cover = await upload(storyFramedPath(s.topicId, s.storyId, publisher, ts, framed.ext), framed.blob);
  // The moving version was made from the old picture: it goes, and the owner re-animates if they want
  if (s.hasAnimation) await supabase.functions.invoke("delete-story-animation", { body: { storyId: s.storyId } }).catch(() => null);
  const { error } = await supabase.from("stories").update({
    cover_illustration_url: cover,
    cover_original_url: original,
    cover_framing: s.framing as never,
    animated_illustration_url: null,
    ...(s.replaced ? { cover_photo_credit: null } : {}),
    updated_at: new Date().toISOString(),
  } as never).eq("id", s.storyId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([ownStoryFilePath(cover)!]).catch(() => null);
    throw error;
  }
  // Tidy the editor's own earlier files (never publisher or AI originals)
  const old = [
    isFramedCover(s.currentCover) ? ownStoryFilePath(s.currentCover) : null,
    s.replaced ? ownStoryFilePath(s.previousOriginal) : null,
  ].filter((p): p is string => Boolean(p) && p !== ownStoryFilePath(original));
  if (old.length) await supabase.storage.from(BUCKET).remove(old).catch(() => null);
  return cover;
}

export interface EventPictureSave {
  eventId: string;
  topicId: string;
  img: HTMLImageElement;
  framing: Framing;
  aspect: number;
  replaced: boolean;
  /** Stored path of the uncropped picture being framed (null when replaced). */
  originalPath: string | null;
  imageHidden: boolean;
}

/** Old event files are swept by the twice-daily gather (anything no event points to). */
export async function saveEventPicture(s: EventPictureSave): Promise<{ image_path: string; image_original_path: string }> {
  const ts = Date.now();
  let original = s.originalPath;
  if (s.replaced || !original) {
    const o = await renderOriginal(s.img);
    original = eventSourcePath(s.topicId, s.eventId, ts, o.ext);
    await upload(original, o.blob);
  }
  const framed = await renderFramed(s.img, s.aspect, s.framing, MAX_OUTPUT_WIDTH.event);
  const path = eventFramedPath(s.topicId, s.eventId, ts, framed.ext);
  await upload(path, framed.blob);
  if (s.imageHidden) await (supabase.rpc as any)("set_topic_event_visibility", { p_event_id: s.eventId, p_action: "show_photo" });
  const { error } = await supabase.from("events").update({
    image_path: path, image_original_path: original, image_framing: s.framing, image_edited: true,
    image_status: "saved", image_hidden: false, updated_at: new Date().toISOString(),
  } as never).eq("id", s.eventId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => null);
    throw error;
  }
  return { image_path: path, image_original_path: original };
}
