import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ReactionCounts {
  thumbsUp: number;
  thumbsDown: number;
  userReaction: 'like' | 'discard' | null;
}

const getVisitorId = (): string => {
  const key = 'curatr_visitor_id';

  const fallback = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    let visitorId = localStorage.getItem(key);
    if (!visitorId) {
      const uuid = globalThis.crypto && 'randomUUID' in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : fallback();
      visitorId = uuid;
      localStorage.setItem(key, visitorId);
    }
    return visitorId;
  } catch {
    // localStorage can be blocked (e.g. private mode). Still return a stable-ish id.
    return fallback();
  }
};

export const useStoryReactions = (storyId: string, topicId: string) => {
  const [counts, setCounts] = useState<ReactionCounts>({
    thumbsUp: 0,
    thumbsDown: 0,
    userReaction: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial counts
  useEffect(() => {
    if (!storyId || !topicId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchCounts = async () => {
      try {
        const visitorId = getVisitorId();
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;

        const { data, error } = await supabase.rpc('get_story_reaction_counts', {
          p_story_id: storyId,
          p_visitor_id: visitorId,
          p_user_id: userId || null,
        });

        if (error) {
          console.error('Error fetching reaction counts:', error);
          return;
        }

        if (data && data.length > 0) {
          setCounts({
            thumbsUp: Number(data[0].thumbs_up) || 0,
            thumbsDown: Number(data[0].thumbs_down) || 0,
            userReaction: data[0].user_reaction as 'like' | 'discard' | null,
          });
        }
      } catch (err) {
        console.error('Error in fetchCounts:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchCounts();

    return () => {
      isMounted = false;
    };
  }, [storyId, topicId]);

  const react = useCallback(
    async (type: 'like' | 'discard') => {
      const visitorId = getVisitorId();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // Optimistic update
      setCounts((prev) => {
        const isToggleOff = prev.userReaction === type;
        const isSwitch = prev.userReaction && prev.userReaction !== type;

        let newThumbsUp = prev.thumbsUp;
        let newThumbsDown = prev.thumbsDown;
        let newUserReaction: 'like' | 'discard' | null = type;

        if (isToggleOff) {
          // Toggling off current reaction
          newUserReaction = null;
          if (type === 'like') newThumbsUp--;
          else newThumbsDown--;
        } else if (isSwitch) {
          // Switching reactions
          if (type === 'like') {
            newThumbsUp++;
            newThumbsDown--;
          } else {
            newThumbsUp--;
            newThumbsDown++;
          }
        } else {
          // New reaction
          if (type === 'like') newThumbsUp++;
          else newThumbsDown++;
        }

        return {
          thumbsUp: Math.max(0, newThumbsUp),
          thumbsDown: Math.max(0, newThumbsDown),
          userReaction: newUserReaction,
        };
      });

      // Call the RPC
      try {
        const { data, error } = await supabase.rpc('upsert_story_reaction', {
          p_story_id: storyId,
          p_visitor_id: visitorId,
          p_swipe_type: type,
          p_topic_id: topicId,
          p_user_id: userId || null,
        });

        if (error) {
          console.error('Error upserting reaction:', error);
          // Revert on error - refetch
          return;
        }

        // Sync with server response
        if (data && data.length > 0) {
          setCounts({
            thumbsUp: Number(data[0].thumbs_up) || 0,
            thumbsDown: Number(data[0].thumbs_down) || 0,
            userReaction: data[0].user_reaction as 'like' | 'discard' | null,
          });
        }
      } catch (err) {
        console.error('Error in react:', err);
      }
    },
    [storyId, topicId]
  );

  return { counts, react, isLoading };
};
