import { useLayoutEffect, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Fit-to-card body text for story slides 2+.
 * One size per story, set by the slide that needs the most room, so the size
 * never jumps between slides. Measured off-screen before paint.
 */

export const FIT_MAX_PHONE = 40;
export const FIT_MAX_DESKTOP = 48;
export const FIT_MIN = 20;
export const FIT_STEP = 2;
export const FIT_LINE_HEIGHT = 1.29;
export const FIT_LETTER_SPACING = '-0.012em';
/** Lexend weight for body slides; must be in the font link in index.html. */
export const FIT_FONT_WEIGHT = 300;
/**
 * The one class + style for body text on slides 2+. Used by BOTH the rendered
 * slide and the off-screen measurer, so the measured size can't drift from
 * what readers see (drift = wrong size or clipped text).
 */
export const FIT_TEXT_CLASS = 'font-lexend text-pretty';
export const FIT_TEXT_STYLE = {
  fontWeight: FIT_FONT_WEIGHT,
  lineHeight: String(FIT_LINE_HEIGHT),
  letterSpacing: FIT_LETTER_SPACING,
} as const;

/** Space reserved inside the slide (matches px-5 pt-6 pb-14 / md:px-8 md:pt-8 md:pb-16). */
export const slidePadding = (width: number) =>
  width >= 768 ? { x: 64, y: 32 + 64 } : { x: 40, y: 24 + 56 };

/** Largest step (max → min) at which every block fits. Pure; `fits` does the measuring. */
export function pickSharedSize(
  blocks: string[],
  fits: (html: string, px: number) => boolean,
  max: number,
  min = FIT_MIN,
  step = FIT_STEP
): { size: number; overflow: number[] } {
  let size = min;
  for (let px = max; px >= min; px -= step) {
    if (blocks.every((b) => fits(b, px))) { size = px; break; }
  }
  const overflow = blocks.map((b, i) => (fits(b, size) ? -1 : i)).filter((i) => i >= 0);
  return { size, overflow };
}

let measurer: HTMLDivElement | null = null;
const getMeasurer = () => {
  if (measurer && document.body.contains(measurer)) return measurer;
  measurer = document.createElement('div');
  measurer.setAttribute('aria-hidden', 'true');
  measurer.className = `feed-card ${FIT_TEXT_CLASS}`;
  Object.assign(measurer.style, {
    position: 'absolute', left: '-10000px', top: '0', visibility: 'hidden',
    pointerEvents: 'none', padding: '0', border: '0',
  }, { ...FIT_TEXT_STYLE, fontWeight: String(FIT_FONT_WEIGHT) });
  document.body.appendChild(measurer);
  return measurer;
};

type FitResult = { size: number; overflow: number[] };
const cache = new Map<string, FitResult>();

/**
 * @param key    stable story id
 * @param blocks sanitized HTML of slides 2+ (last slide incl. byline)
 * @param ref    the slide content area (measured for width/height)
 */
export function useStoryFontSize(key: string, blocks: string[], ref: RefObject<HTMLElement>) {
  const [result, setResult] = useState<FitResult | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const blocksKey = blocks.join('\u0001');
  const timer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const w = Math.round(width), h = Math.round(height);
        if (!w || !h) return;
        setBox((prev) => (prev && Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2 ? prev : { w, h }));
      }, 150);
    });
    ro.observe(el);
    return () => { ro.disconnect(); window.clearTimeout(timer.current); };
  }, [ref]);

  const measure = (b: { w: number; h: number }): FitResult => {
    const pad = slidePadding(b.w);
    const width = Math.min(b.w - pad.x, 576); // max-w-xl
    const height = b.h - pad.y;
    const cacheKey = `${key}|${width}x${height}|${blocksKey}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const m = getMeasurer();
    m.style.width = `${width}px`;
    const fits = (html: string, px: number) => {
      m.style.fontSize = `${px}px`;
      m.innerHTML = html;
      return m.scrollHeight <= height;
    };
    const res = pickSharedSize(blocks, fits, b.w >= 768 ? FIT_MAX_DESKTOP : FIT_MAX_PHONE);
    m.innerHTML = '';
    cache.set(cacheKey, res);
    return res;
  };

  useLayoutEffect(() => {
    if (!box || !blocks.length) return;
    setResult(measure(box));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, blocksKey, key]);

  // Late-arriving fonts change line breaks: re-measure once, uncached.
  useEffect(() => {
    const fonts = (document as any).fonts;
    if (!box || !blocks.length || !fonts?.ready) return;
    let cancelled = false;
    // Ask for the exact Lexend weight first so `ready` can't resolve before it loads.
    const wanted = fonts.load
      ? fonts.load(`${FIT_FONT_WEIGHT} 20px Lexend`).catch(() => undefined)
      : Promise.resolve();
    wanted.then(() => fonts.ready).then(() => {
      if (cancelled) return;
      for (const k of Array.from(cache.keys())) if (k.startsWith(`${key}|`)) cache.delete(k);
      const next = measure(box);
      setResult((prev) => (prev && prev.size === next.size && prev.overflow.join() === next.overflow.join() ? prev : next));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, blocksKey, key]);

  return result;
}
