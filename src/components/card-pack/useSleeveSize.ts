import { useSyncExternalStore } from "react";

const DEFAULT_ASPECT = 300 / 480; // width / height
const CARD_INSET_RATIO = 12 / 300;

function maxWidthForViewport(vw: number): number {
  if (vw < 640) return 360;
  if (vw < 1024) return 400;
  if (vw < 1440) return 460;
  return 520;
}

function vhRatioForViewport(vw: number): number {
  return vw >= 1024 ? 0.7 : 0.82;
}

export interface SleeveSize {
  sleeveW: number;
  sleeveH: number;
  cardInset: number;
  cardW: number;
  cardH: number;
}

const SERVER_SNAPSHOT: SleeveSize = { sleeveW: 300, sleeveH: 480, cardInset: 12, cardW: 276, cardH: 456 };

function compute(aspect: number): SleeveSize {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = maxWidthForViewport(vw);
  const maxH = maxW / aspect;
  let h = Math.min(vh * vhRatioForViewport(vw), maxH);
  let w = h * aspect;
  if (w > vw * 0.88) {
    w = vw * 0.88;
    h = w / aspect;
  }
  w = Math.round(w);
  h = Math.round(h);
  const inset = Math.round(w * CARD_INSET_RATIO);
  return { sleeveW: w, sleeveH: h, cardInset: inset, cardW: w - inset * 2, cardH: h - inset * 2 };
}

const cache = new Map<number, SleeveSize>();

function getOrCompute(aspect: number): SleeveSize {
  const existing = cache.get(aspect);
  if (existing) return existing;
  const fresh = compute(aspect);
  cache.set(aspect, fresh);
  return fresh;
}

function subscribeFor(aspect: number) {
  return (cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    const handler = () => {
      cache.set(aspect, compute(aspect));
      cb();
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  };
}

/**
 * SSR-safe: returns a deterministic snapshot on the server, hydrates to
 * window-sized snapshot on mount. Cache is keyed by aspect so multiple
 * card packs on one page don't fight.
 */
export function useSleeveSize(aspect: number = DEFAULT_ASPECT) {
  return useSyncExternalStore(
    subscribeFor(aspect),
    () => getOrCompute(aspect),
    () => SERVER_SNAPSHOT
  );
}
