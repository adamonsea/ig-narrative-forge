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
  topic_article_id?: string | null;
  article_published_at?: string | null;
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
