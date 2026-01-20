import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorId } from '@/lib/visitorId';

export interface ReactionCounts {
  thumbsUp: number;
  thumbsDown: number;
  userReaction: 'like' | 'discard' | null;
}

export const useStoryReactions = (storyId: string, topicId: string) => {
  const [counts, setCounts] = useState<ReactionCounts>({
    thumbsUp: 0,
    thumbsDown: 0,
    userReaction: null,
  });
  // Start with isLoading=false - only show as loading if we actually start fetching
  const [isLoading, setIsLoading] = useState(false);
  const [isReacting, setIsReacting] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch initial counts
  useEffect(() => {
    // If required ids are missing (can happen briefly during route/carousel transitions),
    // make sure we don't leave the UI stuck in a disabled/loading state.
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

        if (isMounted && data && data.length > 0) {
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

    // Add timeout to prevent infinite loading state
    const timeoutId = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 5000);

    fetchCounts();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [storyId, topicId]);

  const react = useCallback(
    async (type: 'like' | 'discard') => {
      // Ensure we never leave the UI stuck disabled if anything throws (e.g. auth.getUser()).
      setIsReacting(true);

      // If the RPC hangs, don't leave the buttons blocked forever.
      const safetyTimeoutId = setTimeout(() => {
        if (mountedRef.current) setIsReacting(false);
      }, 5000);

      try {
        if (!storyId || !topicId) return;

        const visitorId = getVisitorId();

        // auth.getUser() can throw in some environments; treat it as optional.
        let userId: string | null = null;
        try {
          const { data: userData } = await supabase.auth.getUser();
          userId = userData?.user?.id ?? null;
        } catch (err) {
          console.warn('Unable to read auth user for reaction (continuing as anonymous):', err);
        }

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

        const { data, error } = await supabase.rpc('upsert_story_reaction', {
          p_story_id: storyId,
          p_visitor_id: visitorId,
          p_swipe_type: type,
          p_topic_id: topicId,
          p_user_id: userId,
        });

        if (error) {
          console.error('Error upserting reaction:', error);
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
      } finally {
        clearTimeout(safetyTimeoutId);
        if (mountedRef.current) setIsReacting(false);
      }
    },
    [storyId, topicId]
  );

  return { counts, react, isLoading, isReacting };
};
