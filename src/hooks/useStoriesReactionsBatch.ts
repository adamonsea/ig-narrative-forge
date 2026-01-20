import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorId } from '@/lib/visitorId';

export interface ReactionCounts {
  thumbsUp: number;
  thumbsDown: number;
  userReaction: 'like' | 'discard' | null;
}

export type ReactionCountsMap = Map<string, ReactionCounts>;

/**
 * Batch fetch reaction counts for multiple stories in a single RPC call.
 * Returns a Map of storyId -> ReactionCounts for efficient lookup.
 */
export const useStoriesReactionsBatch = (storyIds: string[], topicId: string) => {
  const [countsMap, setCountsMap] = useState<ReactionCountsMap>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  
  // Track which story IDs we've already fetched to avoid duplicate calls
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset fetched IDs when topic changes
  useEffect(() => {
    fetchedIdsRef.current.clear();
    setCountsMap(new Map());
  }, [topicId]);

  useEffect(() => {
    if (!storyIds.length || !topicId) {
      return;
    }

    // Filter to only fetch new story IDs we haven't seen
    const newStoryIds = storyIds.filter(id => id && !fetchedIdsRef.current.has(id));
    
    if (newStoryIds.length === 0) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchBatchCounts = async () => {
      try {
        const visitorId = getVisitorId();
        
        let userId: string | null = null;
        try {
          const { data: userData } = await supabase.auth.getUser();
          userId = userData?.user?.id ?? null;
        } catch (err) {
          console.warn('Unable to read auth user for batch reactions:', err);
        }

        const { data, error } = await supabase.rpc('get_story_reaction_counts_batch', {
          p_story_ids: newStoryIds,
          p_visitor_id: visitorId,
          p_user_id: userId,
        });

        if (error) {
          console.error('Error fetching batch reaction counts:', error);
          return;
        }

        if (isMounted && data) {
          // Mark these IDs as fetched
          newStoryIds.forEach(id => fetchedIdsRef.current.add(id));
          
          // Merge new results into existing map
          setCountsMap(prev => {
            const newMap = new Map(prev);
            (data as any[]).forEach(row => {
              newMap.set(row.story_id, {
                thumbsUp: Number(row.thumbs_up) || 0,
                thumbsDown: Number(row.thumbs_down) || 0,
                userReaction: row.user_reaction as 'like' | 'discard' | null,
              });
            });
            return newMap;
          });
        }
      } catch (err) {
        console.error('Error in fetchBatchCounts:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    // Add timeout to prevent infinite loading state
    const timeoutId = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 5000);

    fetchBatchCounts();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [storyIds.join(','), topicId]); // Join IDs for stable dependency

  /**
   * Update counts optimistically after a reaction.
   * Called by StoryReactionBar after user interaction.
   */
  const updateCounts = useCallback((storyId: string, newCounts: ReactionCounts) => {
    setCountsMap(prev => {
      const newMap = new Map(prev);
      newMap.set(storyId, newCounts);
      return newMap;
    });
  }, []);

  return { countsMap, isLoading, updateCounts };
};
