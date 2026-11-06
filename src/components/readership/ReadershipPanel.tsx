import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EngagementFunnel } from "@/components/EngagementFunnel";
import { EyeCatchingHeadlines } from "@/components/EyeCatchingHeadlines";
import { readershipChange, barHeights, MEANINGFUL_READERS } from "@/lib/readership";
import { useCountUp } from "@/hooks/useCountUp";
import { optimizeImageUrl } from "@/lib/imageOptimization";

interface TopStory { id: string; title: string; reads: number; image?: string | null }
interface Readership {
  reads_week: number;
  reads_prev_week: number;
  readers_week: number;
  daily?: { day: string; reads: number }[];
  top_stories: TopStory[];
}

const fmt = (n: number) => n.toLocaleString("en-GB");

function Count({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={`tabular-nums ${className ?? ""}`}>{fmt(v)}</span>;
}

function Art({ story, width, className }: { story: TopStory; width: number; className: string }) {
  if (!story.image) {
    return <div className={`${className} bg-primary flex items-center justify-center`}><span className="h-3 w-3 rounded-full bg-mint" /></div>;
  }
  return (
    <img
      src={optimizeImageUrl(story.image, { width, quality: 75 }) || story.image}
      alt=""
      loading="lazy"
      decoding="async"
      className={`${className} object-cover`}
    />
  );
}

export const ReadershipPanel = ({ topicId, topicSlug }: { topicId: string; topicSlug?: string }) => {
  const [data, setData] = useState<Readership | null>(null);

  useEffect(() => {
    let alive = true;
    (supabase.rpc as any)("get_topic_readership", { p_topic_id: topicId }).then(({ data }: { data: Readership | null }) => {
      if (alive) setData(data ?? { reads_week: 0, reads_prev_week: 0, readers_week: 0, daily: [], top_stories: [] });
    });
    return () => { alive = false; };
  }, [topicId]);

  if (!data) return <div className="h-96" aria-busy="true" />;

  const reads = Number(data.reads_week) || 0;
  const change = readershipChange(reads, Number(data.reads_prev_week) || 0);
  const daily = (data.daily ?? []).map((d) => ({ ...d, reads: Number(d.reads) || 0 }));
  const heights = barHeights(daily.map((d) => d.reads));
  const [best, ...rest] = data.top_stories ?? [];
  const storyHref = (id: string) => (topicSlug ? `/feed/${topicSlug}/story/${id}` : undefined);

  return (
    <div className="max-w-4xl space-y-14 py-8">
      <section aria-label="Reads this week" className="grid gap-10 md:grid-cols-[auto_1fr] md:items-end">
        <div>
          <div className="flex items-start gap-4">
            <Count value={reads} className="font-display text-8xl md:text-9xl leading-[0.85] tracking-tight" />
            {change && (
              <span className={`mt-2 text-2xl font-semibold tabular-nums ${change.direction === "up" ? "text-pop" : "text-muted-foreground"}`}>
                {change.direction === "up" ? "▲" : "▼"} {change.percent}%
              </span>
            )}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">reads this week</p>
        </div>

        {daily.length > 0 && (
          <div className="flex h-36 items-end gap-2 md:gap-3" role="img" aria-label={daily.map((d) => `${d.day}: ${d.reads}`).join(", ")}>
            {daily.map((d, i) => {
              const today = i === daily.length - 1;
              return (
                <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div
                    className={`w-full rounded-t-md origin-bottom animate-[bar-rise_0.6s_ease-out_both] motion-reduce:animate-none ${today ? "bg-mint" : "bg-primary/85"}`}
                    style={{ height: `${heights[i]}%`, animationDelay: `${i * 60}ms` }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.day + "T00:00:00").toLocaleDateString("en-GB", { weekday: "narrow" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {best && (
        <a href={storyHref(best.id)} className="group relative block overflow-hidden rounded-2xl bg-primary">
          <Art story={best} width={1200} className="aspect-[16/9] w-full transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary via-primary/70 to-transparent p-6 pt-24 md:p-10 md:pt-32">
            <Count value={Number(best.reads)} className="block font-display text-7xl md:text-8xl leading-none text-primary-foreground" />
            <h3 className="mt-3 max-w-2xl font-display text-2xl md:text-3xl leading-tight text-primary-foreground line-clamp-2">
              {best.title}
            </h3>
          </div>
        </a>
      )}

      {rest.length > 0 && (
        <ol className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {rest.map((s) => (
            <li key={s.id} className="w-[72%] shrink-0 snap-start sm:w-[44%] md:w-[calc(25%-15px)]">
              <a href={storyHref(s.id)} className="group block">
                <div className="overflow-hidden rounded-xl bg-primary">
                  <Art story={s} width={480} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none" />
                </div>
                <Count value={Number(s.reads)} className="mt-4 block font-display text-5xl leading-none" />
                <p className="mt-2 text-base leading-snug line-clamp-2 group-hover:underline">{s.title}</p>
              </a>
            </li>
          ))}
        </ol>
      )}

      {Number(data.readers_week) >= MEANINGFUL_READERS && (
        <div className="space-y-14">
          <EngagementFunnel topicId={topicId} />
          <EyeCatchingHeadlines topicId={topicId} topicSlug={topicSlug} />
        </div>
      )}
    </div>
  );
};
