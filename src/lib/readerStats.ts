/**
 * Pure rules for the dashboard reader figures (no AI, covered by readerStats.test.ts).
 */

/** Friendly names for common referring sites; anything else shows its own address. */
export function sourceName(host: string): string {
  const h = host.toLowerCase().replace(/^(www\.|m\.|l\.|lm\.)/, '');
  if (/(^|\.)google\./.test(h) || h === 'news.google.com') return 'Google';
  if (h === 'android.gm' || h === 'com.google.android.gm' || h === 'mail.google.com') return 'Gmail';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h)) return 'Facebook';
  if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram';
  if (h === 't.co' || /(^|\.)(x\.com|twitter\.com)$/.test(h)) return 'X';
  if (/(^|\.)linkedin\.com$/.test(h) || h === 'lnkd.in') return 'LinkedIn';
  if (/(^|\.)bing\.com$/.test(h)) return 'Bing';
  if (/(^|\.)duckduckgo\.com$/.test(h)) return 'DuckDuckGo';
  if (/(^|\.)reddit\.com$/.test(h)) return 'Reddit';
  return h;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Daily self-check. Arrays are the last 14 days, oldest first, today last.
 * Compares the last 3 complete days with the 7 days before them: visits at least doubled
 * (and up by 5+ a day) while readers stayed within 25% (+1) of before → likely automated traffic.
 */
export function likelyAutomatedRise(visitsDaily: number[] | null | undefined, readersDaily: number[] | null | undefined): boolean {
  const v = (visitsDaily ?? []).map((x) => Number(x) || 0);
  const r = (readersDaily ?? []).map((x) => Number(x) || 0);
  if (v.length < 11 || r.length < 11) return false;
  const end = v.length - 1; // exclude today (partial)
  const vRecent = avg(v.slice(end - 3, end)), vPrior = avg(v.slice(end - 10, end - 3));
  const rRecent = avg(r.slice(end - 3, end)), rPrior = avg(r.slice(end - 10, end - 3));
  const visitsJumped = vRecent >= vPrior * 2 && vRecent - vPrior >= 5;
  const readersFlat = rRecent <= rPrior * 1.25 + 1;
  return visitsJumped && readersFlat;
}

/** Feed-level stopped/swiped rates show once this many outside readers saw headlines this week. */
export const FEED_SIGNAL_MIN_READERS = 3;
export const FEED_SIGNAL_MIN_HEADLINES = 20;

export interface FeedSignal { readers?: number | null | undefined; headlines?: number | null | undefined; stop_rate?: number | null | undefined; swipe_rate?: number | null | undefined }

export function feedSignal(s: FeedSignal | null | undefined): { stopped: number; swiped: number; readers: number } | null {
  if (!s) return null;
  const readers = Number(s.readers) || 0, headlines = Number(s.headlines) || 0;
  if (readers < FEED_SIGNAL_MIN_READERS || headlines < FEED_SIGNAL_MIN_HEADLINES) return null;
  if (s.stop_rate == null || s.swipe_rate == null) return null;
  return { stopped: Math.round(Number(s.stop_rate) * 100), swiped: Math.round(Number(s.swipe_rate) * 100), readers };
}

// ---------- Engagement (Readership three lines + story drawer) ----------

/** One story's week, from get_topic_readership `stories`. stop_rate/score are present only above STORY_SCORE_FLOOR. */
export interface EngagementStory {
  id: string;
  title: string;
  image?: string | null | undefined;
  reads: number;
  seen: number;
  stop_rate?: number | null | undefined;
  score?: number | null | undefined;
  opened: number;
  read_through: number;
  source_clicks: number;
  shares: number;
}
export interface SentToSources { stories: number; tickets: number; details: number; calendar: number }
export interface FeedEngagement { visits: number; seen_per_visit?: number | null | undefined; signups: number; shares: number }

const n = (x: unknown) => Number(x) || 0;

/**
 * Best stories, at most 3. With stories above the reader floor: ranked by position-corrected stop score
 * (story_stop_scores), then source clicks. Otherwise: most reads, then source clicks, shown as reads, never rates.
 */
export function bestStories(stories: EngagementStory[] | null | undefined, max = 3): { by: "stops" | "reads"; items: EngagementStory[] } {
  const list = stories ?? [];
  const rated = list.filter((s) => s.stop_rate != null && s.score != null);
  if (rated.length) {
    return { by: "stops", items: [...rated].sort((a, b) => n(b.score) - n(a.score) || n(b.source_clicks) - n(a.source_clicks)).slice(0, max) };
  }
  const read = list.filter((s) => n(s.reads) > 0 || n(s.source_clicks) > 0);
  return { by: "reads", items: [...read].sort((a, b) => n(b.reads) - n(a.reads) || n(b.source_clicks) - n(a.source_clicks)).slice(0, max) };
}

/** One quiet line under a best story. */
export function bestStoryLine(s: EngagementStory, by: "stops" | "reads"): string {
  const lead = by === "stops" ? `${Math.round(n(s.stop_rate) * 100)}% stopped` : `${n(s.reads)} ${n(s.reads) === 1 ? "read" : "reads"}`;
  const clicks = n(s.source_clicks);
  return clicks ? `${lead} · ${clicks} to source` : lead;
}

/** Clicks out to original articles and event pages (calendar saves are not clicks out). */
export const sentTotal = (s: SentToSources | null | undefined): number => (s ? n(s.stories) + n(s.tickets) + n(s.details) : 0);

/** The tooltip split for "Sent to sources". */
export function sentSplit(s: SentToSources | null | undefined): string {
  if (!s) return "";
  const parts = [
    n(s.stories) && `${n(s.stories)} to stories`,
    n(s.tickets) && `${n(s.tickets)} to tickets`,
    n(s.details) && `${n(s.details)} to event details`,
    n(s.calendar) && `${n(s.calendar)} saved to calendar`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Drawer rows for one story. Stop rate only above the reader floor; everything else as plain counts. */
export function storyDetailRows(s: EngagementStory): { label: string; value: string }[] {
  const rows = [{ label: "Seen", value: String(n(s.seen)) }];
  if (s.stop_rate != null) rows.push({ label: "Stopped", value: `${Math.round(n(s.stop_rate) * 100)}%` });
  rows.push({ label: "Reads", value: String(n(s.reads)) });
  rows.push({ label: "Read to the end", value: n(s.opened) ? `${n(s.read_through)} of ${n(s.opened)}` : String(n(s.read_through)) });
  rows.push({ label: "To source", value: String(n(s.source_clicks)) });
  rows.push({ label: "Shares", value: String(n(s.shares)) });
  return rows;
}

/** Stories seen per visit shows once there are this many visits this week. */
export const SEEN_PER_VISIT_MIN_VISITS = 5;

export function seenPerVisit(f: FeedEngagement | null | undefined): number | null {
  if (!f || n(f.visits) < SEEN_PER_VISIT_MIN_VISITS || f.seen_per_visit == null) return null;
  return Math.round(n(f.seen_per_visit));
}
