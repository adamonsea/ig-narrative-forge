import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PinnedStory {
  story_id: string; title: string | null; slug: string | null;
  cover_url: string | null; source_name: string | null; pinned_until: string;
}

export const pinnedStoriesKey = (topicId?: string) => ["topic-pinned-stories", topicId];

/** Up to 9 live pinned stories for a feed, newest pin first (public feeds and the owner's own). */
export function usePinnedStories(topicId?: string) {
  return useQuery({
    queryKey: pinnedStoriesKey(topicId),
    enabled: Boolean(topicId),
    staleTime: 60_000,
    queryFn: async (): Promise<PinnedStory[]> => {
      const { data, error } = await (supabase.rpc as any)("get_topic_pinned_stories", { p_topic_id: topicId });
      if (error) throw error;
      return (data ?? []) as PinnedStory[];
    },
  });
}
