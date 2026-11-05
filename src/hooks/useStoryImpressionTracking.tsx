import { getVisitorId } from '@/lib/visitorIdentity';
import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const generateVisitorId = (): string => getVisitorId('visitor');

/**
 * Hook to track story impressions when users scroll past stories in the feed
 */
export const useStoryImpressionTracking = (topicId: string | undefined) => {
  const trackedStories = useRef<Set<string>>(new Set());
  const visitorId = useRef<string>(generateVisitorId());

  const trackImpression = useCallback((storyId: string) => {
    if (!topicId || !storyId) return;
    
    // Only track each story once per session
    if (trackedStories.current.has(storyId)) return;
    trackedStories.current.add(storyId);

    // Fire and forget - don't block the UI
    (async () => {
      try {
        // Use direct insert with upsert to handle deduplication
        await supabase
          .from('story_impressions' as any)
          .upsert({
            topic_id: topicId,
            story_id: storyId,
            visitor_id: visitorId.current,
            impression_date: new Date().toISOString().split('T')[0]
          }, {
            onConflict: 'topic_id,story_id,visitor_id,impression_date',
            ignoreDuplicates: true
          });
      } catch (error) {
        console.debug('Story impression tracking failed:', error);
      }
    })();
  }, [topicId]);

  return { trackImpression };
};
