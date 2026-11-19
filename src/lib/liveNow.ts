import { getDisplayDate } from "@/lib/displayDate";

/**
 * Live now on the Desk mirrors the public feed: the same stories, in the same order.
 *
 * A story is in the feed when it's a feed story (made from one of the feed's articles),
 * flagged published, has status published or ready, and its display date isn't in the
 * future. Order: display date newest first, then id (the feed RPCs' tie-break).
 * Everything else that's written (drafts, held duplicates, unpublished ready ones) is
 * "written, not live" and waits in the Story pool.
 */
export interface LiveNowStory {
  id: string;
  status: string;
  is_published: boolean;
  created_at: string;
  topic_article_id?: string | null | undefined;
  article_published_at?: string | null | undefined;
}

const WRITTEN = new Set(["draft", "ready", "published"]);

export function isInFeed(s: LiveNowStory, now: number = Date.now()): boolean {
  if (!s.is_published || !s.topic_article_id) return false;
  if (s.status !== "published" && s.status !== "ready") return false;
  return new Date(getDisplayDate(s.created_at, s.article_published_at)).getTime() <= now;
}

export function feedOrder<T extends LiveNowStory>(a: T, b: T): number {
  const da = getDisplayDate(a.created_at, a.article_published_at);
  const db = getDisplayDate(b.created_at, b.article_published_at);
  if (da !== db) return da < db ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function splitLiveNow<T extends LiveNowStory>(stories: T[], now: number = Date.now()): { live: T[]; held: T[] } {
  const live: T[] = [];
  const held: T[] = [];
  for (const s of stories) {
    if (isInFeed(s, now)) live.push(s);
    else if (WRITTEN.has(s.status)) held.push(s);
  }
  live.sort(feedOrder);
  held.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { live, held };
}

/**
 * Stories the owner has just published from the Desk show in Live now straight away,
 * before the next load confirms it: same feed rules, treated as published and unscheduled.
 */
export function withJustPublished<T extends LiveNowStory & { scheduled_publish_at?: string | null | undefined }>(
  stories: T[],
  justPublished: ReadonlySet<string>,
): T[] {
  if (justPublished.size === 0) return stories;
  return stories.map((s) =>
    justPublished.has(s.id) ? { ...s, status: "published", is_published: true, scheduled_publish_at: null } : s,
  );
}

/** Written-but-not-live stories older than this are stale: news has moved on. */
export const STALE_HELD_DAYS = 7;

/**
 * Stale stories in "Written, not in the feed": written over STALE_HELD_DAYS ago and not
 * scheduled for later. The Desk offers to archive them in one go (archive, never delete).
 */
export function staleHeld<T extends LiveNowStory & { scheduled_publish_at?: string | null | undefined }>(
  held: T[],
  now: number = Date.now(),
  days: number = STALE_HELD_DAYS,
): T[] {
  const cutoff = now - days * 86_400_000;
  return held.filter((s) => {
    if (new Date(s.created_at).getTime() >= cutoff) return false;
    return !(s.scheduled_publish_at && new Date(s.scheduled_publish_at).getTime() > now);
  });
}

/**
 * Story pool groups for written-but-not-live stories:
 * - toCheck: drafts written in the last STALE_HELD_DAYS that nothing will publish on its own,
 *   pinned in amber for the owner's one-click Publish or Skip;
 * - queued: ready, or scheduled for later, so the drip (or its time) will publish it;
 * - other: everything else (mostly stale drafts, offered for archiving in one go).
 */
export function groupHeld<T extends LiveNowStory & { scheduled_publish_at?: string | null | undefined }>(
  held: T[],
  now: number = Date.now(),
  days: number = STALE_HELD_DAYS,
): { toCheck: T[]; queued: T[]; other: T[] } {
  const cutoff = now - days * 86_400_000;
  const toCheck: T[] = [];
  const queued: T[] = [];
  const other: T[] = [];
  for (const s of held) {
    const future = Boolean(s.scheduled_publish_at && new Date(s.scheduled_publish_at).getTime() > now);
    if (s.status === "ready" || future) queued.push(s);
    else if (s.status === "draft" && new Date(s.created_at).getTime() >= cutoff) toCheck.push(s);
    else other.push(s);
  }
  return { toCheck, queued, other };
}

const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** The live story a held story's headline (nearly) repeats, the closest one first; null when none. */
export function findLiveRepeat<T extends { title?: string | null | undefined }>(title: string, live: T[], threshold = 0.8): T | null {
  const a = words(title);
  let best: T | null = null;
  let bestScore = threshold;
  for (const s of live) {
    const score = similarity(a, words(s.title || ""));
    if (score >= bestScore) { best = s; bestScore = score; }
  }
  return best;
}

/** True when a held story's headline is (nearly) the same as one already live: a repeat, safe to Skip. */
export function isRepeatOfLive(title: string, liveTitles: string[], threshold = 0.8): boolean {
  return findLiveRepeat(title, liveTitles.map((t) => ({ title: t })), threshold) !== null;
}
