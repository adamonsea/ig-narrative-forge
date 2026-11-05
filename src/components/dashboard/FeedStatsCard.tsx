import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { pickHighlight, pickNudge, type HighlightStats, type Nudge } from "@/lib/feedHighlights";

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
});

const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

async function shareOrCopy(url: string, title: string) {
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch { /* user cancelled */ }
}

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

export function ReadingNow({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-pop opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-pop" />
      </span>
      <span className="tabular-nums">{count} reading now</span>
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px] h-7" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-sm ${i === values.length - 1 ? "bg-primary" : "bg-primary/35"}`}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function FeedStatsBody({ stats, topicSlug, topicId, feedName = "your feed" }: { stats: FeedCardStats | undefined; topicSlug?: string; topicId?: string; feedName?: string }) {
  const navigate = useNavigate();
  const highlight = useMemo(() => (stats ? pickHighlight(toHighlightStats(stats), feedName) : null), [stats, feedName]);
  const nudge = useMemo(() => (stats ? pickNudge(highlight, toHighlightStats(stats)) : null), [stats, highlight]);
  const dismissKey = nudge && topicId ? `curatr:nudge-dismissed:${topicId}:${nudge.kind}` : null;
  const [dismissed, setDismissed] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => { setDismissed(!!dismissKey && localStorage.getItem(dismissKey) === "1"); }, [dismissKey]);
  useEffect(() => {
    if (!highlight?.milestoneKey || !topicId) return;
    const k = `curatr:milestone-seen:${topicId}:${highlight.milestoneKey}`;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setCelebrate(true);
  }, [highlight?.milestoneKey, topicId]);
  if (!stats) {
    return <div className="h-16 rounded-lg bg-muted/50 animate-pulse" />;
  }
  const readsWeek = n(stats.reads_week);
  const change = weekChange(readsWeek, n(stats.reads_prev_week));
  const collecting = daysOfData(stats.first_read_date) < 7;
  const daily = (stats.reads_daily || []).map(n);

  const arrivals = n(stats.arrivals_count);
  const readersToday = n(stats.readers_today);
  const readersWeek = n(stats.readers_week);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://curatr.pro";

  const runNudge = (e: React.MouseEvent, k: Nudge["kind"]) => {
    stop(e);
    if (!topicSlug) return;
    if (k === "share_story" && (nudge?.storyId || stats.top_story_id)) shareOrCopy(`${origin}/feed/${topicSlug}/story/${nudge?.storyId || stats.top_story_id}`, nudge?.storyTitle || stats.top_story_title || feedName);
    else if (k === "share_feed") shareOrCopy(`${origin}/feed/${topicSlug}`, feedName);
    else if (k === "embed") navigate(`/feed/${topicSlug}/widget`);
    else if (k === "subscribe_prompt") navigate(`/dashboard/topic/${topicSlug}?tab=settings`);
  };

  return (
    <div className="space-y-4">
      {/* Hero */}
      {collecting ? (
        <div>
          <p className="text-lg font-medium">Collecting your first week of readers</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {readsWeek > 0 ? `${readsWeek} ${readsWeek === 1 ? "story read" : "stories read"} so far` : "Reads will appear here as people open your stories."}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl md:text-5xl font-semibold tracking-tight tabular-nums leading-none">{readsWeek}</span>
            <span className="text-base text-muted-foreground">stories read this week</span>
          </div>
          <div className="flex items-end gap-3">
            {change !== null && (
              <span className={`text-sm font-medium tabular-nums ${change >= 0 ? "text-pop" : "text-muted-foreground"}`}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
              </span>
            )}
            {daily.length > 0 && <Sparkline values={daily} />}
          </div>
        </div>
      )}

      {readersWeek > 0 && (
        <p className="text-base text-muted-foreground tabular-nums -mt-1">
          Readers: {readersToday > 0 && <>{readersToday} today · </>}{readersWeek} this week
        </p>
      )}

      {/* Most read */}
      {stats.top_story_id && n(stats.top_story_reads) > 0 && topicSlug && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/feed/${topicSlug}/story/${stats.top_story_id}`); }}
          className="w-full text-left flex items-center gap-3 rounded-lg border border-border p-2 pr-3 hover:bg-muted/50 transition-colors"
        >
          {stats.top_story_image ? (
            <img src={stats.top_story_image} alt="" loading="lazy" className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-md bg-muted flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Most read</p>
            <p className="text-sm md:text-base font-medium line-clamp-2">{stats.top_story_title}</p>
          </div>
          <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">{n(stats.top_story_reads)} reads</span>
        </button>
      )}

      {/* Muted line */}
      <p className="text-sm text-muted-foreground tabular-nums leading-relaxed">
        {arrivals > 0 && <>{arrivals} in arrivals · </>}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              {n(stats.subscribers_total)} subscribers
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
        {n(stats.subscribers_week) > 0 && <> (+{n(stats.subscribers_week)} this week)</>}
        {" · "}{n(stats.published_week)} published · {n(stats.sources_count)} sources
      </p>

      {/* Highlight + nudge */}
      {highlight && (
        <p className="relative inline-flex items-start gap-2 text-base font-medium text-foreground">
          {celebrate && <Sparkle />}
          <Sparkles className="w-4 h-4 mt-1 text-pop flex-shrink-0" aria-hidden="true" />
          <span>{highlight.text}</span>
        </p>
      )}
      {nudge && !dismissed && topicSlug && (
        <div className="flex items-center justify-between gap-3 -mt-2 pl-6">
          {nudge.kind === "weekday" ? (
            <span className="text-sm text-muted-foreground">{nudge.text}</span>
          ) : (
            <button type="button" onClick={(e) => runNudge(e, nudge.kind)}
              className="text-sm font-medium text-primary hover:underline underline-offset-4">
              {nudge.text} →
            </button>
          )}
          <button type="button" aria-label="Dismiss suggestion"
            onClick={(e) => { stop(e); if (dismissKey) localStorage.setItem(dismissKey, "1"); setDismissed(true); }}
            className="p-1 rounded text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
