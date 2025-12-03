import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TopicMetadata {
  avgDailyStories: number;
  playModeEnabled: boolean;
  quizCardsEnabled: boolean;
  this_time_last_month_enabled: boolean;
  latestDailyRoundup: string | null;
  latestWeeklyRoundup: string | null;
}

interface UseTopicMetadataResult {
  data: TopicMetadata;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Hook to fetch all secondary topic metadata in parallel
 * This replaces multiple sequential useEffect queries in TopicFeed
 */
export const useTopicMetadata = (topicId: string | undefined, slug: string | undefined): UseTopicMetadataResult => {
  const results = useQueries({
    queries: [
      // Query 1: Average daily stories calculation
      {
        queryKey: ['topic-avg-daily-stories', topicId],
        queryFn: async () => {
          if (!topicId) return 0;

          // Get first published story date for this topic (both systems in parallel)
          const [legacyResult, mtResult] = await Promise.all([
            supabase
              .from('stories')
              .select('created_at, articles!inner(topic_id)')
              .eq('articles.topic_id', topicId)
              .in('status', ['ready', 'published'])
              .order('created_at', { ascending: true })
              .limit(1),
            supabase
              .from('stories')
              .select('created_at, topic_articles!inner(topic_id)')
              .eq('topic_articles.topic_id', topicId)
              .in('status', ['ready', 'published'])
              .not('topic_article_id', 'is', null)
              .order('created_at', { ascending: true })
              .limit(1)
          ]);

          const dates = [
            ...(legacyResult.data || []),
            ...(mtResult.data || [])
          ].map(s => new Date(s.created_at).getTime());

          if (dates.length === 0) return 0;

          const firstStoryDate = new Date(Math.min(...dates));
          const now = new Date();
          const daysActive = Math.max(1, Math.ceil((now.getTime() - firstStoryDate.getTime()) / (1000 * 60 * 60 * 24)));

          // Get total counts in parallel
          const [legacyCount, mtCount] = await Promise.all([
            supabase
              .from('stories')
              .select('id, articles!inner(topic_id)', { count: 'exact', head: true })
              .eq('articles.topic_id', topicId)
              .in('status', ['ready', 'published']),
            supabase
              .from('stories')
              .select('id, topic_articles!inner(topic_id)', { count: 'exact', head: true })
              .eq('topic_articles.topic_id', topicId)
              .in('status', ['ready', 'published'])
              .not('topic_article_id', 'is', null)
          ]);

          const totalCount = (legacyCount.count || 0) + (mtCount.count || 0);
          return totalCount > 0 ? totalCount / daysActive : 0;
        },
        enabled: !!topicId,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
      },
      // Query 2: Play mode and quiz settings (combined)
      {
        queryKey: ['topic-insight-settings', topicId],
        queryFn: async () => {
          if (!topicId) return { playModeEnabled: true, quizCardsEnabled: false, thisTimeLastMonthEnabled: false };
          
          const { data, error } = await supabase
            .from('topic_insight_settings')
            .select('play_mode_enabled, quiz_cards_enabled, this_time_last_month_enabled')
            .eq('topic_id', topicId)
            .maybeSingle();

          if (error) {
            console.log('Error fetching insight settings:', error);
            return { playModeEnabled: true, quizCardsEnabled: false, thisTimeLastMonthEnabled: false };
          }

          // No row found - use defaults
          if (!data) {
            console.log('No insight settings row found for topic, using defaults');
            return { playModeEnabled: true, quizCardsEnabled: false, thisTimeLastMonthEnabled: false };
          }

          console.log('Insight settings loaded:', { 
            playModeEnabled: data.play_mode_enabled, 
            quizCardsEnabled: data.quiz_cards_enabled,
            thisTimeLastMonthEnabled: data.this_time_last_month_enabled
          });

          return {
            playModeEnabled: data.play_mode_enabled !== false,
            quizCardsEnabled: data.quiz_cards_enabled ?? false,
            thisTimeLastMonthEnabled: data.this_time_last_month_enabled ?? false
          };
        },
        enabled: !!topicId,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      },
      // Query 3: Latest roundups (daily and weekly combined)
      {
        queryKey: ['topic-latest-roundups', topicId],
        queryFn: async () => {
          if (!topicId) return { daily: null, weekly: null };

          const [dailyResult, weeklyResult] = await Promise.all([
            supabase
              .from('topic_roundups')
              .select('period_start')
              .eq('topic_id', topicId)
              .eq('roundup_type', 'daily')
              .eq('is_published', true)
              .order('period_start', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('topic_roundups')
              .select('period_start')
              .eq('topic_id', topicId)
              .eq('roundup_type', 'weekly')
              .eq('is_published', true)
              .order('period_start', { ascending: false })
              .limit(1)
              .maybeSingle()
          ]);

          return {
            daily: dailyResult.data ? format(new Date(dailyResult.data.period_start), 'yyyy-MM-dd') : null,
            weekly: weeklyResult.data ? format(new Date(weeklyResult.data.period_start), 'yyyy-MM-dd') : null
          };
        },
        enabled: !!topicId,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      },
    ],
  });

  const [avgDailyResult, insightSettingsResult, roundupsResult] = results;

  const isLoading = results.some(r => r.isLoading);
  const isError = results.some(r => r.isError);

  return {
    data: {
      avgDailyStories: avgDailyResult.data ?? 0,
      playModeEnabled: insightSettingsResult.data?.playModeEnabled ?? true,
      quizCardsEnabled: insightSettingsResult.data?.quizCardsEnabled ?? false,
      this_time_last_month_enabled: insightSettingsResult.data?.thisTimeLastMonthEnabled ?? false,
      latestDailyRoundup: roundupsResult.data?.daily ?? null,
      latestWeeklyRoundup: roundupsResult.data?.weekly ?? null,
    },
    isLoading,
    isError,
  };
};
