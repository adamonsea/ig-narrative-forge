import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useMemo, useState } from "react";
import { pickHighlight, type HighlightStats } from "@/lib/feedHighlights";

export interface FeedCardStats {
  topic_id: string;
  reading_now: number;
  reads_week: number;
  reads_prev_week: number;
  reads_daily: number[] | null;
  first_read_date: string | null;
  top_story_id: string | null;
  top_story_title: string | null;
  top_story_image: string | null;
  top_story_reads: number | null;
  subscribers_total: number;
  subscribers_week: number;
  email_subscribers: number;
  push_subscribers: number;
  registrants_total: number;
  installs_total: number;
  published_week: number;
  sources_count: number;
  arrivals_count: number;
  readers_today: number;
  readers_week: number;
  readers_prev_week: number;
  weekly_reads: number[] | null;
  best_prior_day: number | null;
  best_day_date: string | null;
  best_day_reads: number | null;
  median_story_reads: number | null;
  reads_total: number;
  published_total: number;
  new_referrer: string | null;
  new_referrer_readers: number | null;
  return_rate_week: number | null;
  return_rate_prev: number | null;
  loyal_reader_days: number | null;
  new_country: string | null;
  new_country_readers: number | null;
  top_weekday: number | null;
  top_weekday_share: number | null;
  search_impressions_week?: number | null;
  search_clicks_week?: number | null;
  search_impressions_prev?: number | null;
  search_impressions_total?: number | null;
  search_weeks?: number | null;
  search_best_prior_week?: number | null;
  top_search_story_id?: string | null;
  top_search_story_title?: string | null;
  top_search_story_clicks?: number | null;
  top_stop_story_id?: string | null;
  top_stop_story_title?: string | null;
  top_stop_rate?: number | null;
  top_stop_seen?: number | null;
  median_stop_rate?: number | null;
  stop_qualifying_stories?: number | null;
}

const toHighlightStats = (s: FeedCardStats): HighlightStats => ({
  reads_week: n(s.reads_week), reads_prev_week: n(s.reads_prev_week),
  readers_week: n(s.readers_week), readers_prev_week: n(s.readers_prev_week),
  weekly_reads: (s.weekly_reads || []).map(n), first_read_date: s.first_read_date,
  best_prior_day: n(s.best_prior_day), best_day_date: s.best_day_date, best_day_reads: n(s.best_day_reads),
  top_story_id: s.top_story_id, top_story_title: s.top_story_title, top_story_reads: n(s.top_story_reads),
  median_story_reads: n(s.median_story_reads), subscribers_total: n(s.subscribers_total), subscribers_week: n(s.subscribers_week),
  new_referrer: s.new_referrer, new_referrer_readers: n(s.new_referrer_readers),
  return_rate_week: s.return_rate_week == null ? null : Number(s.return_rate_week),
  return_rate_prev: s.return_rate_prev == null ? null : Number(s.return_rate_prev),
  loyal_reader_days: n(s.loyal_reader_days), new_country: s.new_country, new_country_readers: n(s.new_country_readers),
  reads_total: n(s.reads_total), published_total: n(s.published_total),
  top_weekday: s.top_weekday == null ? null : Number(s.top_weekday),
  top_weekday_share: s.top_weekday_share == null ? null : Number(s.top_weekday_share),
  search_impressions_week: n(s.search_impressions_week), search_clicks_week: n(s.search_clicks_week),
  search_impressions_prev: n(s.search_impressions_prev), search_impressions_total: n(s.search_impressions_total),
  search_weeks: n(s.search_weeks), search_best_prior_week: n(s.search_best_prior_week),
  top_search_story_id: s.top_search_story_id ?? null, top_search_story_title: s.top_search_story_title ?? null,
  top_search_story_clicks: n(s.top_search_story_clicks),
  top_stop_story_id: s.top_stop_story_id ?? null, top_stop_story_title: s.top_stop_story_title ?? null,
  top_stop_rate: s.top_stop_rate == null ? null : Number(s.top_stop_rate), top_stop_seen: n(s.top_stop_seen),
  median_stop_rate: s.median_stop_rate == null ? null : Number(s.median_stop_rate),
  stop_qualifying_stories: n(s.stop_qualifying_stories),
});

const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

function Sparkle() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -left-1 -top-1 h-6 w-6 motion-reduce:hidden">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-pop animate-[sparkle_900ms_ease-out_forwards]"
          style={{ ["--a" as any]: `${i * 60}deg` }} />
      ))}
    </span>
  );
}

const n = (v: unknown) => Number(v) || 0;

/** Days of read data collected so far (inclusive). */
export const daysOfData = (firstReadDate: string | null, today = new Date()) => {
  if (!firstReadDate) return 0;
  const first = new Date(firstReadDate + "T00:00:00Z").getTime();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((t - first) / 86400000) + 1;
};

/** Week-on-week change; null when there's too little to compare (<5 reads last week). */
export const weekChange = (thisWeek: number, lastWeek: number): number | null => {
  if (lastWeek < 5) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
};

/** One status signal: "● Live · N reading now" (count dropped when 0) or "● Draft". */
export function FeedStatus({ live, readingNow, onToggle }: { live: boolean; readingNow: number; onToggle?: () => void }) {
  return (
    <button type="button" onClick={(e) => { stop(e); onToggle?.(); }}
      aria-label={live ? "Feed is live. Click to take offline." : "Feed is a draft. Click to publish."}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-pop" : "bg-muted-foreground/50"}`} aria-hidden="true" />
      <span className="tabular-nums">{live ? "Live" : "Draft"}{live && readingNow > 0 && <> · {readingNow} reading now</>}</span>
    </button>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px] h-6" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-sm ${i === values.length - 1 ? "bg-primary/50" : "bg-muted-foreground/25"}`}
          style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Week-on-week change is only shown when it's a clear rise (10%+). */
export const visibleRise = (change: number | null): number | null => (change !== null && change >= 10 ? change : null);

export function FeedStatsBody({ stats, topicSlug, topicId, feedName = "your feed" }: { stats: FeedCardStats | undefined; topicSlug?: string; topicId?: string; feedName?: string }) {
  const highlight = useMemo(() => (stats ? pickHighlight(toHighlightStats(stats), feedName) : null), [stats, feedName]);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!highlight?.milestoneKey || !topicId) return;
    const k = `curatr:milestone-seen:${topicId}:${highlight.milestoneKey}`;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setCelebrate(true);
  }, [highlight?.milestoneKey, topicId]);
  if (!stats) {
    return <div className="h-24 rounded-lg bg-muted/50 animate-pulse" />;
  }
  const readsWeek = n(stats.reads_week);
  const rise = visibleRise(weekChange(readsWeek, n(stats.reads_prev_week)));
  const collecting = daysOfData(stats.first_read_date) < 7;
  const daily = (stats.reads_daily || []).map(n);
  const isMostRead = highlight?.kind === "story_took_off";

  return (
    <div className="space-y-3">
      {/* Line 2: hero */}
      {collecting ? (
        <p className="text-base text-foreground">
          {readsWeek > 0 ? `${readsWeek} ${readsWeek === 1 ? "story read" : "stories read"} in your first week so far` : "Collecting your first week of readers"}
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 md:gap-x-3 gap-y-1">
          <span className="inline-flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular-nums leading-none">{readsWeek.toLocaleString("en-GB")}</span>
            {daily.length > 0 && <Sparkline values={daily} />}
          </span>
          <span className="text-sm md:text-base text-muted-foreground">stories read this week</span>
          {rise !== null && <span className="text-sm font-medium tabular-nums text-pop">▲ {rise}%</span>}
        </div>
      )}

      {/* Line 3: one highlight */}
      {highlight && (
        <p className="relative flex items-center gap-2 text-base text-foreground min-w-0">
          {celebrate && <Sparkle />}
          <span aria-hidden="true" className="text-pop text-sm flex-shrink-0">✦</span>
          {isMostRead && stats.top_story_image && (
            <img src={stats.top_story_image} alt="" loading="lazy" className="w-6 h-6 rounded object-cover flex-shrink-0" />
          )}
          <span className="min-w-0 line-clamp-2">
            {isMostRead ? <>Most read: {stats.top_story_title} · {n(stats.top_story_reads).toLocaleString("en-GB")} reads</> : highlight.text}
          </span>
        </p>
      )}

      {/* Line 4: muted meta */}
      <p className="text-sm text-muted-foreground tabular-nums">
        {n(stats.readers_week).toLocaleString("en-GB")} readers · {" "}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" onClick={stop} className="rounded hover:text-foreground transition-colors">
              {n(stats.subscribers_total).toLocaleString("en-GB")} subscribers
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto text-sm" onClick={(e) => e.stopPropagation()}>
            <ul className="space-y-1 tabular-nums">
              <li>{n(stats.email_subscribers)} email</li>
              <li>{n(stats.push_subscribers)} push</li>
              <li>{n(stats.registrants_total)} registered</li>
              <li>{n(stats.installs_total)} installed</li>
            </ul>
          </PopoverContent>
        </Popover>
        {" · "}{n(stats.published_total).toLocaleString("en-GB")} published
      </p>
    </div>
  );
}
