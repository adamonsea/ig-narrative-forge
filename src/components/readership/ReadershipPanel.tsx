import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EngagementFunnel } from "@/components/EngagementFunnel";
import { EyeCatchingHeadlines } from "@/components/EyeCatchingHeadlines";
import { readershipChange, MEANINGFUL_READERS } from "@/lib/readership";

interface TopStory { id: string; title: string; reads: number }
interface Readership {
  reads_week: number;
  reads_prev_week: number;
  readers_week: number;
  top_stories: TopStory[];
}

export const ReadershipPanel = ({ topicId, topicSlug }: { topicId: string; topicSlug?: string }) => {
  const [data, setData] = useState<Readership | null>(null);

  useEffect(() => {
    let alive = true;
    (supabase.rpc as any)("get_topic_readership", { p_topic_id: topicId }).then(({ data }: { data: Readership | null }) => {
      if (alive) setData(data ?? { reads_week: 0, reads_prev_week: 0, readers_week: 0, top_stories: [] });
    });
    return () => { alive = false; };
  }, [topicId]);

  if (!data) return <div className="h-48" aria-busy="true" />;

  const reads = Number(data.reads_week) || 0;
  const change = readershipChange(reads, Number(data.reads_prev_week) || 0);
  const [best, ...rest] = data.top_stories ?? [];
  const storyHref = (id: string) => (topicSlug ? `/feed/${topicSlug}/story/${id}` : undefined);

  return (
    <div className="max-w-2xl space-y-12 py-6">
      <div>
        <p className="display-heading text-7xl md:text-8xl leading-none tabular-nums tracking-tight">
          {reads.toLocaleString()}
        </p>
        <p className="mt-3 text-lg text-muted-foreground">
          reads this week
          {change && (
            <span className={change.direction === "up" ? "text-foreground" : ""}>
              {" · "}{change.direction === "up" ? "↑" : "↓"} {change.percent}% on last week
            </span>
          )}
        </p>
      </div>

      {best ? (
        <p className="text-xl md:text-2xl leading-snug">
          <a href={storyHref(best.id)} className="hover:underline">{best.title}</a>
          <span className="text-muted-foreground"> was read most, {Number(best.reads).toLocaleString()} times.</span>
        </p>
      ) : (
        <p className="text-xl text-muted-foreground">No story reads yet this week.</p>
      )}

      {rest.length > 0 && (
        <ol className="space-y-4">
          {rest.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-6 text-lg">
              <a href={storyHref(s.id)} className="truncate hover:underline">{s.title}</a>
              <span className="shrink-0 tabular-nums text-muted-foreground">{Number(s.reads).toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}

      {Number(data.readers_week) >= MEANINGFUL_READERS && (
        <div className="space-y-10 border-t pt-10">
          <EngagementFunnel topicId={topicId} />
          <EyeCatchingHeadlines topicId={topicId} topicSlug={topicSlug} />
        </div>
      )}
    </div>
  );
};
