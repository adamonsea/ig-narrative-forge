import { opt } from "@/lib/optionalProps";
import { getVisitorId, onReaderTrackable, canTrackReader } from '@/lib/visitorIdentity';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';


/**
 * Hook to track Play Mode page visits (separate from feed visits)
 */
export const usePlayModeVisitorTracking = (topicId: string | undefined) => {
  const hasTracked = useRef<string | null>(null);

  useEffect(() => {
    // Skip if no topicId or already tracked this topicId
    if (!topicId || hasTracked.current === topicId) {
      return;
    }

    const trackVisit = async () => {
      if (!canTrackReader()) return;
      const VISITOR_ID = getVisitorId('visitor');
      try {
        const userAgent = navigator.userAgent;
        const referrer = document.referrer;

        console.log('[PlayMode] Tracking visit for topic:', topicId, 'visitor:', VISITOR_ID);

        const { error } = await supabase
          .from('feed_visits')
          .insert({
            topic_id: topicId,
            visitor_id: VISITOR_ID,
            user_agent: userAgent,
            referrer: referrer || null,
            ...opt("visit_date", new Date().toISOString().split('T')[0]),
            page_type: 'play'
          });

        if (error && error.code !== '23505') {
          console.error('[PlayMode] Visitor tracking error:', error.message, error.details);
        } else {
          hasTracked.current = topicId;
          console.log('[PlayMode] Visit tracked successfully for topic:', topicId);
        }
      } catch (error) {
        console.error('[PlayMode] Visitor tracking failed:', error);
      }
    };

    // Track visit only after a human signal (touch, pointer, wheel, key, scroll)
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onReaderTrackable(() => { timer = setTimeout(trackVisit, 300); });
    return () => { unsubscribe(); if (timer) clearTimeout(timer); };
  }, [topicId]);

  return getVisitorId('visitor');
};
