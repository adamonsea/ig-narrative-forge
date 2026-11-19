/**
 * Where things sit on the 9:16 event poster (1080×1920), kept clear of
 * Instagram's own furniture: profile bar and progress at the top, caption,
 * music and reply bar at the bottom, like/comment/share column on the right.
 * Pure numbers so the safe-zone rule is testable.
 */
export const W = 1080;
export const H = 1920;

export const SAFE = { top: 250, bottom: 420, left: 88, right: 190 } as const;

export const TILE = { w: 248, h: 280, header: 84, radius: 28 } as const;
const TILE_GAP = 52;

/** Title size by length: short names big, long names smaller. */
export function titleSize(title: string): number {
  const n = title.trim().length;
  if (n <= 22) return 108;
  if (n <= 44) return 92;
  if (n <= 70) return 78;
  return 68;
}

export const TITLE_MAX_LINES = 4;
export const LINE_HEIGHT = 1.08;

export interface PosterLayout {
  tileX: number;
  tileY: number;
  /** Alphabetic baseline of each title line. */
  baselines: number[];
  /** Top of the first title line (cap height approx). */
  titleTop: number;
  textWidth: number;
}

/** Title sits on the bottom of the safe area; the calendar tile sits above it. */
export function posterLayout(lineCount: number, size: number): PosterLayout {
  const lines = Math.max(1, Math.min(TITLE_MAX_LINES, lineCount));
  const step = Math.round(size * LINE_HEIGHT);
  const last = H - SAFE.bottom - Math.ceil(size * 0.22); // leave room for descenders
  const baselines = Array.from({ length: lines }, (_, i) => last - (lines - 1 - i) * step);
  const titleTop = baselines[0] - Math.round(size * 0.78);
  const tileY = Math.max(SAFE.top, titleTop - TILE_GAP - TILE.h);
  return { tileX: SAFE.left, tileY, baselines, titleTop, textWidth: W - SAFE.left - SAFE.right };
}
