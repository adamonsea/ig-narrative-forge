import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles } from "lucide-react";

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
  insight_type: string | null;
  insight_text: string | null;
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

export function FeedStatsBody({ stats, topicSlug }: { stats: FeedCardStats | undefined; topicSlug?: string }) {
  const navigate = useNavigate();
  if (!stats) {
    return <div className="h-16 rounded-lg bg-muted/50 animate-pulse" />;
  }
  const readsWeek = n(stats.reads_week);
  const change = weekChange(readsWeek, n(stats.reads_prev_week));
  const collecting = daysOfData(stats.first_read_date) < 7;
  const daily = (stats.reads_daily || []).map(n);

  const arrivals = n(stats.arrivals_count);

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

      {/* Insight */}
      {stats.insight_text && (
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <Sparkles className="w-3.5 h-3.5" />
          {stats.insight_text}
        </p>
      )}
    </div>
  );
}
