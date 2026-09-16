import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: any; error: any }>)(
    name,
    args
  );

export interface FlowRow { day: string; gathered: number; published: number }
export interface CoverageRow { category_name: string; current_count: number; previous_count: number }
export interface TermRow { term: string; recent_count: number; baseline_count: number }
export interface SourceRow {
  source_id: string;
  source_name: string;
  canonical_domain: string;
  stories_published_7d: number;
  stories_published_total: number;
  last_story_date: string | null;
  is_active: boolean;
}
export interface PopularStory {
  story_id: string;
  headline: string;
  swipe_count: number;
}

function useAsync<T>(loader: () => Promise<T>, deps: unknown[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const result = await loader();
      setData(result);
    } catch {
      /* panel stays quiet rather than breaking the page */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, reload: load };
}

export function useDailyFlow(topicId: string) {
  return useAsync<FlowRow[]>(
    async () => {
      if (!topicId) return [];
      const { data } = await rpc("get_topic_daily_flow", { p_topic_id: topicId, p_days: 30 });
      return (data || []) as FlowRow[];
    },
    [topicId],
    []
  );
}

export function useCoverageMix(topicId: string) {
  return useAsync<CoverageRow[]>(
    async () => {
      if (!topicId) return [];
      const { data } = await rpc("get_topic_coverage_mix", { p_topic_id: topicId });
      return (data || []) as CoverageRow[];
    },
    [topicId],
    []
  );
}

export function useRisingTerms(topicId: string) {
  return useAsync<TermRow[]>(
    async () => {
      if (!topicId) return [];
      const { data } = await rpc("get_topic_rising_terms", { p_topic_id: topicId });
      return (data || []) as TermRow[];
    },
    [topicId],
    []
  );
}

export function useSourceMix(topicId: string) {
  return useAsync<SourceRow[]>(
    async () => {
      if (!topicId) return [];
      const { data } = await rpc("get_topic_source_stats", { p_topic_id: topicId });
      return ((data || []) as SourceRow[])
        .slice()
        .sort((a, b) => (b.stories_published_7d || 0) - (a.stories_published_7d || 0));
    },
    [topicId],
    []
  );
}

export function usePopularStories(topicId: string) {
  return useAsync<PopularStory[]>(
    async () => {
      if (!topicId) return [];
      const { data } = await rpc("get_popular_stories_by_period", { p_topic_id: topicId });
      const rows = (data || []) as { story_id: string; swipe_count: number }[];
      const best = new Map<string, number>();
      rows.forEach((r) => {
        best.set(r.story_id, Math.max(best.get(r.story_id) || 0, r.swipe_count || 0));
      });
      const ids = [...best.keys()].slice(0, 20);
      if (!ids.length) return [];
      const { data: stories } = await supabase
        .from("stories")
        .select("id, title")
        .in("id", ids);
      return (stories || [])
        .map((s: any) => ({
          story_id: s.id,
          headline: s.title || "Untitled story",
          swipe_count: best.get(s.id) || 0,
        }))
        .sort((a, b) => b.swipe_count - a.swipe_count)
        .slice(0, 5);
    },
    [topicId],
    []
  );
}

/** Readers today and in the last hour, refreshed while the tab is visible. */
export function useLiveReaders(topicId: string) {
  const [readers, setReaders] = useState<{ hour: number; today: number } | null>(null);
  const timer = useRef<number>();

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;

    const fetchNow = async () => {
      if (document.hidden) return;
      const { data } = await rpc("get_topic_live_readers", { p_topic_id: topicId });
      const row = Array.isArray(data) ? data[0] : data;
      if (!cancelled && row) {
        setReaders({ hour: Number(row.readers_last_hour) || 0, today: Number(row.readers_today) || 0 });
      }
    };

    fetchNow();
    timer.current = window.setInterval(fetchNow, 60000);
    document.addEventListener("visibilitychange", fetchNow);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
      document.removeEventListener("visibilitychange", fetchNow);
    };
  }, [topicId]);

  return readers;
}
