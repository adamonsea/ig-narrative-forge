// run with: bun test ./src/lib/deskCache.test.ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { clearDeskSnapshots, DESK_SNAPSHOT_MAX_AGE_MS, readDeskMemory, readDeskStored, writeDeskSnapshot, type DeskSnapshot } from './deskCache';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as any).window = { sessionStorage: new MemoryStorage() };

const snap = (savedAt: number): DeskSnapshot => ({
  articles: [{ id: 'a1' }], queueItems: [], stories: [{ id: 's1', slides: [{ id: 'x' }] }], stats: {},
  totalArticlesCount: 1, hasMoreArticles: false, publishedLoadedCount: 1, hasMorePublished: false, savedAt,
});

describe('desk snapshot', () => {
  beforeEach(() => clearDeskSnapshots());

  it('returns the last lists for the same feed only', () => {
    writeDeskSnapshot('feed-a', snap(Date.now()), 'owner-1');
    expect(readDeskMemory('feed-a')?.articles).toEqual([{ id: 'a1' }]);
    expect(readDeskMemory('feed-b')).toBeNull();
  });

  it('hides lists older than the max age', () => {
    const now = Date.now();
    writeDeskSnapshot('feed-a', snap(now - DESK_SNAPSHOT_MAX_AGE_MS - 1), 'owner-1');
    expect(readDeskMemory('feed-a', now)).toBeNull();
  });

  it('only gives the same-tab copy back to the account that saved it', () => {
    writeDeskSnapshot('feed-a', snap(Date.now()), 'owner-1');
    expect(readDeskStored('feed-a', 'owner-2')).toBeNull();
    expect(readDeskStored('feed-a', 'owner-1')?.stories).toHaveLength(1);
  });

  it('forgets everything on sign-out', () => {
    writeDeskSnapshot('feed-a', snap(Date.now()), 'owner-1');
    clearDeskSnapshots();
    expect(readDeskMemory('feed-a')).toBeNull();
    expect(readDeskStored('feed-a', 'owner-1')).toBeNull();
  });
});
