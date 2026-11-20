/**
 * Last-seen Desk lists per feed, so returning to the Desk shows the Story pool
 * and Live now at once while fresh data loads quietly behind them.
 * Memory first (in-app navigation, tab switches), then sessionStorage (reloads
 * in the same browser tab, scoped to the signed-in account). Never the source
 * of truth: every visit still revalidates from the server.
 */

export interface DeskSnapshot<A = unknown, Q = unknown, S = unknown, T = unknown> {
  articles: A[];
  queueItems: Q[];
  stories: S[];
  stats: T;
  totalArticlesCount: number | null;
  hasMoreArticles: boolean;
  publishedLoadedCount: number;
  hasMorePublished: boolean;
  savedAt: number;
}

/** Older than this, a snapshot is not shown (the Desk loads normally). */
export const DESK_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const STORAGE_PREFIX = "curatr:desk:v1:";

const memory = new Map<string, DeskSnapshot>();

function fresh(snap: DeskSnapshot | undefined | null, now: number): snap is DeskSnapshot {
  return !!snap && now - snap.savedAt >= 0 && now - snap.savedAt <= DESK_SNAPSHOT_MAX_AGE_MS;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Synchronous memory read, safe to use in a useState initializer. */
export function readDeskMemory(topicId: string | null | undefined, now = Date.now()): DeskSnapshot | null {
  if (!topicId) return null;
  const snap = memory.get(topicId);
  if (fresh(snap, now)) return snap;
  memory.delete(topicId);
  return null;
}

/** Same-tab copy for full reloads; only returned to the account that saved it. */
export function readDeskStored(topicId: string, userId: string, now = Date.now()): DeskSnapshot | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_PREFIX + topicId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; snap?: DeskSnapshot };
    if (parsed.userId !== userId || !fresh(parsed.snap, now)) return null;
    memory.set(topicId, parsed.snap);
    return parsed.snap;
  } catch {
    return null;
  }
}

export function writeDeskSnapshot(topicId: string, snap: DeskSnapshot, userId?: string | null): void {
  memory.set(topicId, snap);
  const store = storage();
  if (!store || !userId) return;
  try {
    store.setItem(STORAGE_PREFIX + topicId, JSON.stringify({ userId, snap }));
  } catch {
    // Too big for this browser: keep the list without slide text (it reloads in the background).
    try {
      const light = { ...snap, stories: (snap.stories as Array<Record<string, unknown>>).map((s) => ({ ...s, slides: [] })) };
      store.setItem(STORAGE_PREFIX + topicId, JSON.stringify({ userId, snap: light }));
    } catch {
      /* memory copy still works */
    }
  }
}

/** Forget every feed's snapshot (sign-out or account switch). */
export function clearDeskSnapshots(): void {
  memory.clear();
  const store = storage();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) store.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
