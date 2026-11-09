/** Rule-based highlight + nudge picker for the dashboard feed card. Every positive must be true. */
import { STORY_SCORE_FLOOR } from "./readership";

export interface HighlightStats {
  reads_week: number;
  reads_prev_week: number;
  readers_week: number;
  readers_prev_week: number;
  weekly_reads: number[]; // oldest -> current week
  first_read_date: string | null;
  best_prior_day: number;
  best_day_date: string | null;
  best_day_reads: number;
  top_story_id: string | null;
  top_story_title: string | null;
  top_story_reads: number;
  median_story_reads: number;
  subscribers_total: number;
  subscribers_week: number;
  new_referrer: string | null;
  new_referrer_readers: number;
  return_rate_week: number | null;
  return_rate_prev: number | null;
  loyal_reader_days: number;
  new_country: string | null;
  new_country_readers: number;
  reads_total: number;
  published_total: number;
  top_weekday: number | null;
  top_weekday_share: number | null;
  // Google Search (final days only; optional until data arrives)
  search_impressions_week?: number;
  search_clicks_week?: number;
  search_impressions_prev?: number;
  search_impressions_total?: number;
  search_weeks?: number;
  search_best_prior_week?: number;
  top_search_story_id?: string | null;
  top_search_story_title?: string | null;
  top_search_story_clicks?: number;
  // Headline stop rate (7 days, stories with 30+ outside readers; median_stop_rate = what its feed spots usually get)
  top_stop_story_id?: string | null;
  top_stop_story_title?: string | null;
  top_stop_rate?: number | null;
  top_stop_seen?: number;
  median_stop_rate?: number | null;
  stop_qualifying_stories?: number;
}

export type HighlightKind =
  | "milestone" | "best_week" | "story_took_off" | "streak" | "best_day" | "reads_up" | "readers_up"
  | "new_referrer" | "new_subscribers" | "returning_up" | "new_country"
  | "search_up" | "top_search_story" | "best_search_week" | "fallback_search_total"
  | "eye_catching"
  | "fallback_reads_total" | "fallback_subscribers" | "fallback_loyal" | "fallback_published";

export interface Highlight { kind: HighlightKind; text: string; score: number; milestoneKey?: string }

export type NudgeKind = "share_story" | "embed" | "subscribe_prompt" | "weekday" | "share_feed";
export interface Nudge { kind: NudgeKind; text: string; storyId?: string; storyTitle?: string }

const MILESTONES = [1000, 500, 250, 100, 50];
const READ_MILESTONES = [10000, 1000];
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const fmt = (v: number) => v.toLocaleString("en-GB");
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

export const daysSince = (date: string | null, today = new Date()) => {
  if (!date) return 0;
  const first = new Date(date + "T00:00:00Z").getTime();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((t - first) / 86400000) + 1;
};

const countryName = (code: string) => {
  try { return new Intl.DisplayNames(["en-GB"], { type: "region" }).of(code.toUpperCase()) || code; } catch { return code; }
};

export function isDown(s: HighlightStats) {
  return s.reads_prev_week >= 5 && s.reads_week < s.reads_prev_week;
}

export function candidates(s: HighlightStats, feedName: string, today = new Date()): Highlight[] {
  const out: Highlight[] = [];
  const history = daysSince(s.first_read_date, today);
  const down = isDown(s);

  // 1. subscriber milestone
  const m = MILESTONES.find((x) => s.subscribers_total >= x && s.subscribers_total - s.subscribers_week < x);
  if (m) out.push({ kind: "milestone", score: 100, text: `${feedName} just passed ${m} subscribers`, milestoneKey: `subs-${m}` });

  const weeks = s.weekly_reads || [];
  const cur = weeks[weeks.length - 1] ?? s.reads_week;
  const prior = weeks.slice(0, -1);

  if (!down) {
    // 2. best week ever
    if (history >= 28 && s.reads_week >= 30 && prior.length >= 4 && s.reads_week > Math.max(...prior)) {
      out.push({ kind: "best_week", score: 90, text: `Best week yet: ${fmt(s.reads_week)} reads` });
    }
    // 4. growth streak
    let streak = 0;
    for (let i = weeks.length - 1; i > 0; i--) {
      if (weeks[i] >= 20 && weeks[i - 1] >= 20 && weeks[i] > weeks[i - 1]) streak++; else break;
    }
    if (streak >= 3 && cur === s.reads_week) {
      out.push({ kind: "streak", score: 75 + 3 * (streak - 3), text: `Reads up ${streak} weeks in a row` });
    }
    // 6. reads up
    if (s.reads_prev_week >= 20) {
      const p = pct(s.reads_week, s.reads_prev_week);
      if (p >= 15) out.push({ kind: "reads_up", score: 50 + Math.min(20, p / 5), text: `Reads up ${p}% on last week` });
    }
    // 7. readers up
    if (s.readers_prev_week >= 10) {
      const p = pct(s.readers_week, s.readers_prev_week);
      if (p >= 15) out.push({ kind: "readers_up", score: 45 + Math.min(20, p / 5), text: `${p}% more readers than last week` });
    }
    // 10. returning readers up
    if (s.readers_prev_week >= 10 && s.return_rate_week != null && s.return_rate_prev != null
        && s.return_rate_week >= 0.25 && s.return_rate_week - s.return_rate_prev >= 0.05) {
      const oneIn = Math.max(2, Math.round(1 / s.return_rate_week));
      out.push({ kind: "returning_up", score: 55, text: `1 in ${oneIn} readers came back this week` });
    }
  }

  // 3. story took off
  if (s.top_story_id && s.top_story_reads >= 25 && s.median_story_reads > 0) {
    const mult = s.top_story_reads / s.median_story_reads;
    if (mult >= 3) {
      out.push({ kind: "story_took_off", score: 80 + Math.min(10, mult),
        text: `"${s.top_story_title}" was read ${mult.toFixed(1)}× more than usual` });
    }
  }
  // 5. best day ever
  if (history >= 14 && s.best_day_date && s.best_day_reads >= 15 && s.best_day_reads > (s.best_prior_day || 0)) {
    const day = new Date(s.best_day_date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    out.push({ kind: "best_day", score: 70, text: `${day} was your best day ever: ${fmt(s.best_day_reads)} reads` });
  }
  // 8. new referring site
  if (s.new_referrer && s.new_referrer_readers >= 3) {
    out.push({ kind: "new_referrer", score: 60, text: `${s.new_referrer} sent you ${s.new_referrer_readers} readers` });
  }
  // 9. new subscribers
  if (s.subscribers_week >= 3) {
    out.push({ kind: "new_subscribers", score: Math.min(60, 40 + 2 * s.subscribers_week), text: `${s.subscribers_week} new subscribers this week` });
  }
  // 11. new country
  if (s.new_country && s.new_country_readers >= 2) {
    out.push({ kind: "new_country", score: 35, text: `First readers from ${countryName(s.new_country)}` });
  }
  // 12-14. Google Search (never on a search drop)
  const sw = s.search_impressions_week ?? 0, sp = s.search_impressions_prev ?? 0;
  const searchDown = sp > 0 && sw < sp;
  if (!searchDown) {
    if ((s.search_weeks ?? 0) >= 4 && sw >= 200 && sw > (s.search_best_prior_week ?? 0)) {
      out.push({ kind: "best_search_week", score: 65, text: `Best week in Google yet: seen ${fmt(sw)} times` });
    }
    if (sp >= 100 && pct(sw, sp) >= 25) {
      out.push({ kind: "search_up", score: 55, text: `Your feed appeared in Google ${fmt(sw)} times this week` });
    }
  }
  if (s.top_search_story_id && s.top_search_story_title && (s.top_search_story_clicks ?? 0) >= 5) {
    out.push({ kind: "top_search_story", score: 50, text: `"${s.top_search_story_title}" was your top search story` });
  }
  // 15. Eye-catching headline: 30+ outside readers (the one story floor), 25%+ stop rate, 1.5x what its feed
  //     spots usually get (median_stop_rate = position-expected rate from story_stop_scores), 3+ scored stories
  const rate = s.top_stop_rate ?? 0, med = s.median_stop_rate ?? 0;
  if (s.top_stop_story_id && s.top_stop_story_title && (s.top_stop_seen ?? 0) >= STORY_SCORE_FLOOR && rate >= 0.25
      && (s.stop_qualifying_stories ?? 0) >= 3 && med > 0 && rate >= med * 1.5) {
    out.push({ kind: "eye_catching", score: 58,
      text: `"${s.top_stop_story_title}" stopped ${Math.round(rate * 100)}% of scrollers — your most eye-catching headline` });
  }
  return out;
}

export function fallback(s: HighlightStats, feedName: string): Highlight | null {
  if (s.reads_total >= 100) {
    const rm = READ_MILESTONES.find((x) => s.reads_total >= x);
    return { kind: "fallback_reads_total", score: 10, text: `${fmt(s.reads_total)} stories read since launch`,
      milestoneKey: rm ? `reads-${rm}` : undefined };
  }
  if ((s.search_impressions_total ?? 0) >= 500) return { kind: "fallback_search_total", score: 9.5, text: `Seen in Google ${fmt(s.search_impressions_total!)} times since tracking began` };
  if (s.subscribers_total >= 10) return { kind: "fallback_subscribers", score: 9, text: `${fmt(s.subscribers_total)} people chose to follow ${feedName}` };
  if (s.loyal_reader_days >= 5) return { kind: "fallback_loyal", score: 8, text: `Your most loyal reader has come back on ${s.loyal_reader_days} days` };
  if (s.published_total >= 10) return { kind: "fallback_published", score: 7, text: `${fmt(s.published_total)} stories published to date` };
  return null;
}

const ORDER: HighlightKind[] = ["milestone", "best_week", "story_took_off", "streak", "best_day", "reads_up",
  "readers_up", "new_referrer", "new_subscribers", "returning_up", "new_country",
  "best_search_week", "search_up", "top_search_story", "eye_catching"];

export function pickHighlight(s: HighlightStats, feedName: string, today = new Date()): Highlight | null {
  const list = candidates(s, feedName, today)
    .sort((a, b) => b.score - a.score || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return list[0] ?? fallback(s, feedName);
}

export function pickNudge(h: Highlight | null, s: HighlightStats): Nudge {
  const lowSubs = s.readers_week >= 50 && s.subscribers_week < s.readers_week * 0.05;
  if (h && (h.kind === "story_took_off" || h.kind === "best_day") && s.top_story_id) return { kind: "share_story", text: "Share it" };
  if (h?.kind === "eye_catching" && s.top_stop_story_id) {
    return { kind: "share_story", text: "Share it", storyId: s.top_stop_story_id, storyTitle: s.top_stop_story_title ?? undefined };
  }
  if (h?.kind === "top_search_story" && s.top_search_story_id) {
    return { kind: "share_story", text: "Share it", storyId: s.top_search_story_id, storyTitle: s.top_search_story_title ?? undefined };
  }
  if (h?.kind === "new_referrer") return { kind: "embed", text: "Ask them to embed your feed" };
  if (lowSubs) return { kind: "subscribe_prompt", text: "Readers like what they see — add a subscribe nudge" };
  if (h && (h.kind === "new_subscribers" || h.kind === "milestone")) return { kind: "subscribe_prompt", text: "Turn on the subscribe prompt" };
  if (h && ["reads_up", "readers_up", "streak", "best_week"].includes(h.kind)
      && s.top_weekday != null && (s.top_weekday_share ?? 0) >= 0.25) {
    return { kind: "weekday", text: `Your readers are most active on ${DAYS[s.top_weekday]}` };
  }
  return { kind: "share_feed", text: "Share your feed" };
}
