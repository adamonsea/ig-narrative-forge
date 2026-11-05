import { canTrackReader, getVisitorId } from '@/lib/visitorIdentity';
import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Records a story view when a reader swipes into it (upgrade-safe batch RPC, once per session). */
export const useStoryImpressionTracking = (topicId: string | undefined) => {
  const trackedStories = useRef<Set<string>>(new Set());

  const trackImpression = useCallback((storyId: string) => {
    if (!topicId || !storyId || trackedStories.current.has(storyId)) return;
    trackedStories.current.add(storyId);
    if (!canTrackReader()) return;
    (supabase.rpc as any)('record_story_views', {
      p_topic_id: topicId, p_visitor_id: getVisitorId('visitor'), p_items: [{ s: storyId, p: false, d: 0 }],
    }).then(() => {}, () => {});
  }, [topicId]);

  return { trackImpression };
};
