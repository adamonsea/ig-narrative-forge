import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Generate a visitor ID based on browser fingerprint
const generateVisitorId = (): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx!.textBaseline = 'top';
  ctx!.font = '14px Arial';
  ctx!.fillText('Visitor tracking', 2, 2);
  
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL()
  ].join('|');
  
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return 'visitor_' + Math.abs(hash).toString(36);
};

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
          .upsert({
            topic_id: topicId,
            visitor_id: VISITOR_ID,
            user_agent: userAgent,
            referrer: referrer || null,
            visit_date: new Date().toISOString().split('T')[0],
            page_type: 'play'
          }, {
            onConflict: 'topic_id,visitor_id,visit_date,page_type',
            ignoreDuplicates: true
          });

        if (error) {
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
