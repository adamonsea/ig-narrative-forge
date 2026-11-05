import { getVisitorId } from '@/lib/visitorIdentity';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const generateVisitorId = (): string => getVisitorId('visitor');

// Stable visitor ID - generated once per session
const VISITOR_ID = generateVisitorId();

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
            visit_date: new Date().toISOString().split('T')[0],
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

    // Track visit after a short delay to ensure component is mounted
    const timer = setTimeout(trackVisit, 300);
    return () => clearTimeout(timer);
  }, [topicId]);

  return VISITOR_ID;
};
