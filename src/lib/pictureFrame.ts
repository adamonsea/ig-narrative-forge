/**
 * Picture framing: pure maths and file names for the owner's "Edit picture"
 * (replace or move within the frame). The framed picture is baked into a new
 * stored file, so every surface (feed, emails, widgets, share previews, social
 * posters) shows the owner's choice without knowing about framing. The
 * uncropped original and the framing are kept so it can be reframed later.
 */

/** Centre of the crop in the picture (0–1 each way) and zoom (1 = largest crop that fits). */
export interface Framing { x: number; y: number; zoom: number }

export const CENTRED: Framing = { x: 0.5, y: 0.5, zoom: 1 };
export const MAX_ZOOM = 3;

/** Frame shapes (width / height). Event photos are square so both the wide feed band and the tall poster keep the owner's subject. */
export const FRAME_ASPECT = { storySplit: 3 / 2, storyFullBleed: 4 / 5, event: 1 } as const;

/** Largest output width per kind (never upscaled). */
export const MAX_OUTPUT_WIDTH = { story: 1536, event: 1200 } as const;

export interface CropRect { sx: number; sy: number; sw: number; sh: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The part of the picture the frame shows. Always inside the picture. */
export function cropRect(imgW: number, imgH: number, aspect: number, f: Framing): CropRect {
  const zoom = clamp(f.zoom || 1, 1, MAX_ZOOM);
  let sw: number, sh: number;
  if (imgW / imgH > aspect) { sh = imgH; sw = imgH * aspect; } else { sw = imgW; sh = imgW / aspect; }
  sw /= zoom; sh /= zoom;
  const sx = clamp(f.x * imgW - sw / 2, 0, imgW - sw);
  const sy = clamp(f.y * imgH - sh / 2, 0, imgH - sh);
  return { sx, sy, sw, sh };
}

/** The framing as the crop actually lands (centre pulled back inside the picture). */
export function clampFraming(imgW: number, imgH: number, aspect: number, f: Framing): Framing {
  const r = cropRect(imgW, imgH, aspect, f);
  return { x: (r.sx + r.sw / 2) / imgW, y: (r.sy + r.sh / 2) / imgH, zoom: clamp(f.zoom || 1, 1, MAX_ZOOM) };
}

/** Dragging the picture by (dx, dy) frame pixels moves the crop the other way. */
export function panBy(imgW: number, imgH: number, aspect: number, f: Framing, dx: number, dy: number, frameW: number): Framing {
  const r = cropRect(imgW, imgH, aspect, f);
  const perPx = r.sw / frameW;
  return clampFraming(imgW, imgH, aspect, { ...f, x: f.x - (dx * perPx) / imgW, y: f.y - (dy * perPx) / imgH });
}

/** Output size for a crop: the crop's own pixels up to the cap, same shape as the frame. */
export function outputSize(crop: CropRect, aspect: number, maxW: number): { width: number; height: number } {
  const width = Math.max(1, Math.round(Math.min(crop.sw, maxW)));
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

/** A saved framing from the database, or null when it isn't one. */
export function readFraming(v: unknown): Framing | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : null);
  const x = n("x"), y = n("y"), zoom = n("zoom");
  if (x === null || y === null || zoom === null) return null;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), zoom: clamp(zoom, 1, MAX_ZOOM) };
}

// ---- Stored file names (topic-assets bucket) ----

/** Framed story cover. "publisher" marks a framed publisher photo so it keeps its photo credit. */
export const storyFramedPath = (topicId: string, storyId: string, publisher: boolean, ts: number, ext: string) =>
  `${topicId}/stories/${storyId}/${publisher ? "publisher" : "cover"}-${ts}.${ext}`;
/** The owner's replacement picture, uncropped. */
export const storySourcePath = (topicId: string, storyId: string, ts: number, ext: string) =>
  `${topicId}/stories/${storyId}/src-${ts}.${ext}`;
/** Framed event photo: shown wherever stored event photos are (isStoredEventPhoto). */
export const eventFramedPath = (topicId: string, eventId: string, ts: number, ext: "webp" | "jpg") =>
  `${topicId}/events/${eventId}-v${ts}.${ext}`;
/** The owner's replacement event photo, uncropped. */
export const eventSourcePath = (topicId: string, eventId: string, ts: number, ext: "webp" | "jpg") =>
  `${topicId}/events/${eventId}-src${ts}.${ext}`;

const FRAMED_PUBLISHER = /\/topic-assets\/[0-9a-f-]{36}\/stories\/[0-9a-f-]{36}\/publisher-\d+\.(webp|jpg)(\?|$)/i;
const OWN_STORY_FILE = /\/topic-assets\/([0-9a-f-]{36}\/stories\/[0-9a-f-]{36}\/(?:publisher|cover|src)-\d+\.(?:webp|jpg))(?:\?|$)/i;

/** A framed copy of a publisher's photo: still the publisher's picture, so still credited. */
export const isFramedPublisherCover = (url: string | null | undefined) => Boolean(url && FRAMED_PUBLISHER.test(url));

/** Storage path of a file this editor saved for a story, or null for anything else. */
export function ownStoryFilePath(url: string | null | undefined): string | null {
  const m = url ? OWN_STORY_FILE.exec(url) : null;
  return m ? m[1]! : null;
}

/** A cover this editor framed (so its original is the one to reframe from). */
export const isFramedCover = (url: string | null | undefined) => {
  const p = ownStoryFilePath(url);
  return Boolean(p && !/\/src-\d+\./.test(p));
};
