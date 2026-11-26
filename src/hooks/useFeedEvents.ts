/**
 * Reader-side event hooks for the public feed. Kept separate from useWhatsOnEvents
 * (Desk/settings) so the reader's first download carries no workspace code.
 */
import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mergeEventPages, nextEventsOffset, EVENTS_PER_PAGE, type WhatsOnFeedEvent } from "@/lib/whatsOn";

export const eventsFeedKey = (topicId: string | undefined) => ["events-feed", topicId] as const;

/** The feed's upcoming published events (next 14 days, soonest first), fetched once per feed. */
export function useWhatsOnEvents(topicId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["whats-on", topicId] as const,
    enabled: Boolean(topicId) && enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_topic_whats_on", { p_topic_id: topicId });
      if (error) throw error;
      return (data ?? []) as WhatsOnFeedEvent[];
    },
  });
}

/**
 * Individual event cards for events-led feeds: same filters as What's on, longer range,
 * with card facts, 20 at a time, each next page starting 2 before what's loaded.
 */
export function useEventsFeed(topicId: string | undefined, enabled: boolean) {
  const q = useInfiniteQuery({
    queryKey: eventsFeedKey(topicId),
    enabled: Boolean(topicId) && enabled,
    staleTime: 10 * 60 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await (supabase.rpc as any)("get_topic_events_feed", {
        p_topic_id: topicId, p_limit: EVENTS_PER_PAGE, p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as WhatsOnFeedEvent[];
    },
    getNextPageParam: (_last, pages) => nextEventsOffset(pages),
  });
  const events = useMemo(() => mergeEventPages(q.data?.pages ?? []), [q.data]);
  return {
    events,
    isLoading: q.isLoading,
    hasMore: Boolean(q.hasNextPage),
    loadingMore: q.isFetchingNextPage,
    loadMore: q.fetchNextPage,
  };
}
