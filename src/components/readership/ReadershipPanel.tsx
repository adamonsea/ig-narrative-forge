import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EngagementFunnel } from "@/components/EngagementFunnel";
import { RememberedFold } from "@/components/settings/RememberedFold";
import { ReadershipLines } from "@/components/readership/ReadershipLines";
import { readershipChange, barHeights, MEANINGFUL_READERS, dropoffCurve, type Dropoff } from "@/lib/readership";
import { useCountUp } from "@/hooks/useCountUp";
import { feedSignal, seenPerVisit, type FeedSignal, type EngagementStory, type SentToSources, type FeedEngagement } from "@/lib/readerStats";

interface Readership {
  reads_week: number;
  reads_prev_week: number;
  readers_week: number;
  returning_week?: number | null | undefined;
  daily?: { day: string; reads: number }[] | undefined;
  stories?: EngagementStory[] | null | undefined;
  sent?: SentToSources | null | undefined;
  feed?: FeedEngagement | null | undefined;
  dropoff?: Dropoff | null | undefined;
  feed_signal?: FeedSignal | null | undefined;
}

const fmt = (n: number) => n.toLocaleString("en-GB");

function Count({ value, className }: { value: number; className?: string | undefined }) {
  const v = useCountUp(value);
  return <span className={`tabular-nums ${className ?? ""}`}>{fmt(v)}</span>;
}

export const ReadershipPanel = ({ topicId, topicSlug }: { topicId: string; topicSlug?: string | undefined }) => {
  const [data, setData] = useState<Readership | null>(null);

  useEffect(() => {
    let alive = true;
    (supabase.rpc as any)("get_topic_readership", { p_topic_id: topicId }).then(({ data }: { data: Readership | null }) => {
      if (alive) setData(data ?? { reads_week: 0, reads_prev_week: 0, readers_week: 0, daily: [] });
    });
    return () => { alive = false; };
  }, [topicId]);

  if (!data) {
    return (
      <div className="max-w-4xl space-y-12 py-8" aria-busy="true">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
        <div className="h-6 w-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const reads = Number(data.reads_week) || 0;
  const change = readershipChange(reads, Number(data.reads_prev_week) || 0);
  const daily = (data.daily ?? []).map((d) => ({ ...d, reads: Number(d.reads) || 0 }));
  const heights = barHeights(daily.map((d) => d.reads));
  const storyHref = (id: string) => (topicSlug ? `/feed/${topicSlug}/story/${id}` : undefined);
  const curve = dropoffCurve(data.dropoff);
  const feedRates = feedSignal(data.feed_signal);
  const perVisit = seenPerVisit(data.feed);
  const signups = Number(data.feed?.signups) || 0;
  const shares = Number(data.feed?.shares) || 0;

  return (
    <div className="max-w-4xl space-y-12 py-8">
      <ReadershipLines
        readers={Number(data.readers_week) || 0}
        returning={Number(data.returning_week) || 0}
        stories={data.stories ?? []}
        sent={data.sent}
        storyHref={storyHref}
      />

      <RememberedFold foldKey="readership-more" label="More">
        <div className="space-y-10">
          <section aria-label="Reads this week" className="grid gap-8 md:grid-cols-[auto_1fr] md:items-end">
            <div>
              <div className="flex items-baseline gap-3">
                <Count value={reads} className="text-2xl font-semibold leading-none" />
                {change && (
                  <span className={`text-sm font-medium tabular-nums ${change.direction === "up" ? "text-pop" : "text-muted-foreground"}`}>
                    {change.direction === "up" ? "▲" : "▼"} {change.percent}%
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">reads this week</p>
            </div>
            {daily.length > 0 && (
              <div className="flex h-28 items-end gap-3" role="img" aria-label={daily.map((d) => `${d.day}: ${d.reads}`).join(", ")}>
                {daily.map((d, i) => (
                  <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div className={`w-full rounded-t-lg origin-bottom settle-in ${i === daily.length - 1 ? "bg-mint" : "bg-primary/85"}`}
                      style={{ height: `${heights[i]}%`, animationDelay: `${i * 40}ms` }} />
                    <span className="text-sm text-muted-foreground">
                      {new Date(d.day + "T00:00:00").toLocaleDateString("en-GB", { weekday: "narrow" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <dl className="grid grid-cols-3 gap-6">
            <div><dt className="text-sm text-muted-foreground">Stories per visit</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{perVisit ?? "–"}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Sign-ups</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{fmt(signups)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Shares</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{fmt(shares)}</dd></div>
          </dl>

          {feedRates && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {feedRates.stopped}% of headlines stopped readers · {feedRates.swiped}% swiped to read
            </p>
          )}

          {curve && (
            <section aria-label="How far readers scroll" className="space-y-5">
              <p className="text-base">
                {curve.halfGoneBy ? `Half your readers have gone by story ${curve.halfGoneBy}.` : `Most readers reach story ${curve.percents.length}.`}
              </p>
              <ol className="flex h-28 items-end gap-2" aria-label={curve.percents.map((p, i) => `Story ${i + 1}: ${p}%`).join(", ")}>
                {curve.percents.map((p, i) => (
                  <li key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">{p}%</span>
                    <div className={`w-full rounded-t-lg origin-bottom settle-in ${curve.halfGoneBy === i + 1 ? "bg-mint" : "bg-primary/85"}`}
                      style={{ height: `${Math.max(3, p)}%`, animationDelay: `${i * 40}ms` }} />
                    <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {Number(data.readers_week) >= MEANINGFUL_READERS && <EngagementFunnel topicId={topicId} />}
        </div>
      </RememberedFold>
    </div>
  );
};
