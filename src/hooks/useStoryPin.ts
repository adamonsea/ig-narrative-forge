import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { activePinId, type StoryPin } from "@/lib/storyPin";
import { pinnedStoriesKey } from "@/hooks/usePinnedStories";

import { setFeedPin } from "@/lib/feedSetup/services";

const pinKey = (topicId?: string) => ["topic-pin", topicId];

/** The feed's pinned story while the pin lasts (public feeds, and the owner's own). */
export function useTopicPin(topicId?: string) {
  const { data } = useQuery({
    queryKey: pinKey(topicId),
    enabled: Boolean(topicId),
    staleTime: 60_000,
    queryFn: async (): Promise<StoryPin | null> => {
      const { data, error } = await (supabase.rpc as any)("get_topic_pin", { p_topic_id: topicId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? { story_id: row.story_id, pinned_until: row.pinned_until } : null;
    },
  });
  const pin = data ?? null;
  return { pin, pinnedId: activePinId(pin) };
}

/** Pin a live story for 24, 48 or 168 hours, or unpin it (hours = 0). Up to 9 pins per feed. */
export function useSetStoryPin(topicId?: string) {
  const queryClient = useQueryClient();
  return useCallback(async (storyId: string | null, hours: number) => {
    if (!topicId) return;
    await setFeedPin(supabase, topicId, storyId, hours);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: pinKey(topicId) }),
      queryClient.invalidateQueries({ queryKey: pinnedStoriesKey(topicId) }),
    ]);
  }, [topicId, queryClient]);
}
