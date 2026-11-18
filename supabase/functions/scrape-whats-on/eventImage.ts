/**
 * Event photos (pure rules, no network). A listing's own photo is used only when it's a
 * real, decent-sized picture; the card falls back to the category illustration otherwise.
 * Saving and deleting the stored copy lives in eventPhotos.ts.
 */

/** Keys a listing uses for its picture, best first (Brighton's ListViewImage is a 480px crop, so last). */
export const IMAGE_KEYS = [
  'MainImage', 'featured_media_large', 'featured_image', 'image.url', 'image', 'imageUrl', 'image_url',
  'featuredImage.node.sourceUrl', 'thumbnail_url', 'picture', 'GridViewImage', 'ListViewImage',
];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_IMAGE_WIDTH = 480;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** An image address on more than this share of a source's events is a logo or placeholder. */
export const PLACEHOLDER_SHARE = 0.25;

/** A usable https image address from a string, { url } object or list; null otherwise. */
export function imageAddress(v: unknown, base: string, depth = 0): string | null {
  if (v == null || depth > 3) return null;
  if (Array.isArray(v)) return imageAddress(v[0], base, depth + 1);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return imageAddress(o.url ?? o.src ?? o.Url ?? o.contentUrl ?? o.sourceUrl ?? null, base, depth + 1);
  }
  if (typeof v !== 'string' || !v.trim() || v.trim().startsWith('data:')) return null;
  try {
    const u = new URL(v.trim(), base);
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.protocol !== 'https:') return null;
    if (/\.(svg|gif|ico)(\?|$)/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Image addresses repeated across too many of a source's events (logos, "no image" tiles). */
export function placeholderImages(urls: (string | null | undefined)[]): Set<string> {
  const present = urls.filter((u): u is string => Boolean(u));
  const counts = new Map<string, number>();
  for (const u of present) counts.set(u, (counts.get(u) || 0) + 1);
  const out = new Set<string>();
  for (const [u, n] of counts) if (n >= 3 && n / urls.length > PLACEHOLDER_SHARE) out.add(u);
  return out;
}

/** Width and height from the first bytes of a JPEG, PNG or WebP; null when unreadable. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  // PNG: IHDR right after the signature
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  // WebP: RIFF....WEBP then VP8 / VP8L / VP8X
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8 ' && b.length >= 30) return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === 'VP8L' && b.length >= 25) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X' && b.length >= 30) {
      return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    return null;
  }
  // JPEG: walk markers to the first start-of-frame
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}

export type ImageVerdict = { ok: true } | { ok: false; reason: string };

/** Is a fetched picture good enough for the card's top band? */
export function judgeImage(input: { type: string; bytes: number; width?: number | null; height?: number | null }): ImageVerdict {
  const type = input.type.split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) return { ok: false, reason: 'type' };
  if (input.bytes <= 0 || input.bytes > MAX_IMAGE_BYTES) return { ok: false, reason: 'size' };
  if (!input.width || !input.height) return { ok: false, reason: 'unreadable' };
  if (input.width < MIN_IMAGE_WIDTH) return { ok: false, reason: 'small' };
  // Landscape or square only: tall posters crop badly in a wide band
  if (input.height > input.width * 1.05) return { ok: false, reason: 'portrait' };
  return { ok: true };
}

/** The day after an event ends its photo goes (end date, or start date when there is none). */
export function photoExpired(e: { start_date: string; end_date?: string | null }, today: string): boolean {
  return (e.end_date || e.start_date) < today;
}

/** Where a feed's event photos live in the topic-assets bucket (first folder = feed, as its storage rules expect). */
export const photoFolder = (topicId: string) => `${topicId}/events`;
export const photoPath = (topicId: string, eventId: string) => `${photoFolder(topicId)}/${eventId}.webp`;
