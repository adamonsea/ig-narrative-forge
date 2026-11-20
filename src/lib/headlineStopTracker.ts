/**
 * Headline stop-rate tracker. IntersectionObserver only: no scroll listeners, no per-card timers,
 * no layout reads. Results held in memory and sent in batches: right after the first 3s stop, then at most
 * once a minute while visible (changed stories only, so an idle open tab sends nothing), and on pagehide/hide.
 * Each item carries the card's 0-based feed position (first seen); a reader's scroll depth is the deepest
 * position they reached, so no extra field is needed for the drop-off curve.
 */
import { canTrackReader, getVisitorId } from './visitorIdentity';
import { hasHumanSignal } from './humanSignal';

const SEEN_RATIO = 0.6;
const STOP_MS = 3000; // a "stop" = 3s+ continuous dwell (matches story_stop_scores)
const CAP_MS = 30000;
const LIVE_FLUSH_MS = 60 * 1000; // keeps "reading now" (last 5 minutes) live without a heartbeat

type Entry = { paused: boolean; dwell: number; since: number | null; sent: string; inView: boolean; pos: number | null };

export interface HeadlineStopTracker { observe: (el: Element, storyId: string, position?: number) => void; destroy: () => void }

const noop: HeadlineStopTracker = { observe: () => {}, destroy: () => {} };

export function createHeadlineStopTracker(topicId: string, opts: { skip?: boolean | undefined } = {}): HeadlineStopTracker {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window) || opts.skip) return noop;

  const url = `${import.meta.env['VITE_SUPABASE_URL']}/rest/v1/rpc/record_story_views`;
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;
  const stories = new Map<string, Entry>();
  const ids = new WeakMap<Element, string>();
  const positions = new WeakMap<Element, number>();
  const pending: Array<[Element, string]> = [];
  let observer: IntersectionObserver | null = null;
  let firstStopSent = false;
  let firstStopTimer: ReturnType<typeof setTimeout> | null = null;
  let liveTimer: ReturnType<typeof setInterval> | null = null;

  const close = (e: Entry, now: number) => {
    if (e.since == null) return;
    const d = Math.min(CAP_MS, now - e.since);
    e.since = null;
    if (d > e.dwell) e.dwell = d;
    if (d >= STOP_MS) e.paused = true;
  };

  const flush = () => {
    // Nothing is sent for a page no person has touched, moved, scrolled or typed on.
    // ...and nothing for a reader whose counting is off (checked at send time, so an opt-out applies at once).
    if (!hasHumanSignal() || !canTrackReader()) return;
    const visitorId = getVisitorId('visitor');
    const now = performance.now();
    const items: Array<{ s: string; p: boolean; d: number; i?: number | undefined }> = [];
    stories.forEach((e, s) => {
      // close open timings so dwell is captured, then reopen if still visible
      const wasOpen = e.since != null;
      close(e, now);
      if (wasOpen && document.visibilityState === 'visible') e.since = now;
      const sig = `${e.paused ? 1 : 0}:${Math.round(e.dwell / 500)}`;
      if (sig !== e.sent) {
        items.push(e.pos == null ? { s, p: e.paused, d: Math.round(e.dwell) } : { s, p: e.paused, d: Math.round(e.dwell), i: e.pos });
        e.sent = sig;
      }
    });
    if (!items.length) return;
    for (let i = 0; i < items.length; i += 100) {
      try {
        fetch(url, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
          body: JSON.stringify({ p_topic_id: topicId, p_visitor_id: visitorId, p_items: items.slice(i, i + 100) }),
        }).catch(() => {});
      } catch { /* ignore */ }
    }
  };

  const onVisibility = () => {
    const now = performance.now();
    if (document.visibilityState === 'hidden') {
      stories.forEach((e) => close(e, now));
      flush();
    }
    else stories.forEach((e) => { if (e.inView && e.since == null) e.since = now; });
  };
  const onPageHide = () => flush();

  const onIntersect = (entries: IntersectionObserverEntry[]) => {
    const now = performance.now();
    const visible = document.visibilityState === 'visible';
    for (const en of entries) {
      const id = ids.get(en.target); if (!id) continue;
      let e = stories.get(id);
      // Tall cards: also count as in view when they fill 60%+ of the screen (values come with the entry, no layout reads).
      const rootH = en.rootBounds?.height ?? 0;
      const isIn = en.isIntersecting && (en.intersectionRatio >= SEEN_RATIO || (rootH > 0 && en.intersectionRect.height >= rootH * SEEN_RATIO));
      if (isIn) {
        if (!e) { e = { paused: false, dwell: 0, since: null, sent: '', inView: false, pos: positions.get(en.target) ?? null }; stories.set(id, e); }
        e.inView = true;
        if (visible && e.since == null) e.since = now;
      } else if (e) {
        e.inView = false;
        close(e, now);
      }
    }
    // First stop goes out as soon as it happens, so the owner sees a new reader within seconds.
    if (!firstStopSent && !firstStopTimer && visible && [...stories.values()].some((x) => x.since != null)) {
      firstStopTimer = setTimeout(() => {
        firstStopTimer = null;
        const t = performance.now();
        if (!firstStopSent && [...stories.values()].some((x) => x.paused || (x.since != null && t - x.since >= STOP_MS))) {
          firstStopSent = true;
          flush();
        }
      }, STOP_MS + 250);
    }
  };

  const start = () => {
    observer = new IntersectionObserver(onIntersect, { threshold: [0, 0.3, 0.45, SEEN_RATIO, 0.75, 0.9] });
    pending.splice(0).forEach(([el, id]) => { ids.set(el, id); observer!.observe(el); });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    liveTimer = setInterval(() => { if (document.visibilityState === 'visible') flush(); }, LIVE_FLUSH_MS);
  };
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
  if (ric) ric.call(window, start, { timeout: 3000 }); else setTimeout(start, 1200);

  return {
    observe(el, storyId, position) {
      if (typeof position === 'number' && position >= 0 && position < 1000) positions.set(el, Math.floor(position));
      if (observer) { if (ids.get(el) === storyId) return; ids.set(el, storyId); observer.observe(el); }
      else pending.push([el, storyId]);
    },
    destroy() {
      flush();
      observer?.disconnect();
      if (liveTimer) clearInterval(liveTimer);
      if (firstStopTimer) clearTimeout(firstStopTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
}
