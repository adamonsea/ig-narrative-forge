/**
 * Human gate for reader tracking: nothing is recorded until the page sees a real person
 * (touch, pointer move/press, wheel, key press, or a scroll after the first 1.5s, which skips
 * the browser's own scroll restoration). Bots that only load a page never pass.
 * Listeners are passive and removed after the first signal, so the feed and swiping are untouched.
 */
const EVENTS = ['pointerdown', 'pointermove', 'touchstart', 'wheel', 'keydown', 'scroll'] as const;
const SCROLL_GRACE_MS = 1500;

let seen = false;
let armed = false;
const waiters = new Set<() => void>();
const opts: AddEventListenerOptions = { passive: true, capture: true };

/** Pure rule, exported for tests: does this event count as a human signal? */
export const isHumanEvent = (type: string, isTrusted: boolean, msSinceLoad: number): boolean => {
  if (!isTrusted) return false;
  if (!(EVENTS as readonly string[]).includes(type)) return false;
  if (type === 'scroll' && msSinceLoad < SCROLL_GRACE_MS) return false;
  return true;
};

function fire() {
  if (seen) return;
  seen = true;
  if (typeof window !== 'undefined') EVENTS.forEach((e) => window.removeEventListener(e, onEvent, opts));
  waiters.forEach((f) => { try { f(); } catch { /* never break the page */ } });
  waiters.clear();
}

function onEvent(ev: Event) {
  if (isHumanEvent(ev.type, ev.isTrusted, typeof performance !== 'undefined' ? performance.now() : Infinity)) fire();
}

function arm() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  EVENTS.forEach((e) => window.addEventListener(e, onEvent, opts));
}

export const hasHumanSignal = (): boolean => seen;

/** Runs cb once a human signal has been seen (immediately if already). Returns an unsubscribe. */
export function onHumanSignal(cb: () => void): () => void {
  if (seen) { cb(); return () => {}; }
  arm();
  waiters.add(cb);
  return () => { waiters.delete(cb); };
}

// Arm as early as possible so the first touch is never missed.
arm();
