import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Row { story_id: string; title: string; seen: number; stop_rate: number }

/** Top 3 headlines this week by stop rate (stories seen by 20+ outside readers). */
export const EyeCatchingHeadlines = ({ topicId, topicSlug }: { topicId: string; topicSlug?: string }) => {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    (supabase.rpc as any)('get_topic_eye_catching', { p_topic_id: topicId }).then(({ data }: { data: Row[] | null }) => {
      if (alive) setRows(data ?? []);
    });
    return () => { alive = false; };
  }, [topicId]);

  if (rows === null) return null;

  return (
    <section aria-labelledby="eye-catching-heading" className="space-y-2">
      <h4 id="eye-catching-heading" className="text-sm font-medium">Most eye-catching this week</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Needs a few more readers — headlines show here once 20 people have scrolled past them.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.story_id} className="flex items-baseline justify-between gap-3 text-sm">
              {topicSlug ? (
                <a href={`/feed/${topicSlug}/story/${r.story_id}`} className="truncate hover:underline">{r.title}</a>
              ) : (
                <span className="truncate">{r.title}</span>
              )}
              <span className="shrink-0 tabular-nums text-muted-foreground">
                stopped {Math.round(Number(r.stop_rate) * 100)}% · {Number(r.seen)} seen
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
