import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CommunityInsight {
  id: string;
  topic_id: string;
  insight_type: "sentiment" | "concern" | "validation";
  content: string;
  confidence_score: number | null;
  source_type: string;
  source_identifier: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface UseCommunityInsightsOptions {
  limit?: number;
  refreshIntervalMs?: number;
}

export const useCommunityInsights = (
  topicId?: string,
  options: UseCommunityInsightsOptions = {}
) => {
  const { limit = 24, refreshIntervalMs = 1000 * 60 * 15 } = options;
  const [insights, setInsights] = useState<CommunityInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = async () => {
    if (!topicId) {
      setInsights([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("community_insights")
        .select("*")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (queryError) {
        throw queryError;
      }

      setInsights((data || []).map((insight) => ({
        id: insight.id,
        topic_id: insight.topic_id,
        insight_type: insight.insight_type as "sentiment" | "concern" | "validation",
        content: insight.content || "",
        confidence_score: insight.confidence_score ?? null,
        source_type: insight.source_type || "reddit",
        source_identifier: insight.source_identifier || "",
        metadata: (insight.metadata as Record<string, any>) || null,
        created_at: insight.created_at,
      })));
    } catch (err) {
      console.error("Failed to load community insights", err);
      setError(err instanceof Error ? err.message : "Unable to load community insights");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [topicId, limit]);

  useEffect(() => {
    if (!topicId) return;

    const channel = supabase
      .channel(`community-insights-${topicId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_insights",
          filter: `topic_id=eq.${topicId}`,
        },
        () => {
          loadInsights();
        }
      )
      .subscribe();

    let interval: NodeJS.Timeout | undefined;

    if (refreshIntervalMs > 0) {
      interval = setInterval(loadInsights, refreshIntervalMs);
    }

    return () => {
      supabase.removeChannel(channel);
      if (interval) clearInterval(interval);
    };
  }, [topicId, refreshIntervalMs]);

  const lastUpdated = useMemo(() => {
    return insights.length > 0 ? insights[0].created_at : null;
  }, [insights]);

  return {
    insights,
    loading,
    error,
    lastUpdated,
    refresh: loadInsights,
  };
};
