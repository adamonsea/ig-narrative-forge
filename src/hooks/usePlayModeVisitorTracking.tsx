import { useEffect, useState } from 'react';
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

/**
 * Hook to track Play Mode page visits (separate from feed visits)
 */
export const usePlayModeVisitorTracking = (topicId: string | undefined) => {
  const [visitorId, setVisitorId] = useState<string>('');

  useEffect(() => {
    const id = generateVisitorId();
    setVisitorId(id);
  }, []);

  useEffect(() => {
    if (!topicId || !visitorId) return;

    const trackVisit = async () => {
      try {
        const userAgent = navigator.userAgent;
        const referrer = document.referrer;

        // Use direct insert - RPC types not yet updated
        await supabase
          .from('feed_visits')
          .insert({
            topic_id: topicId,
            visitor_id: visitorId,
            user_agent: userAgent,
            referrer: referrer || null,
            visit_date: new Date().toISOString().split('T')[0],
            page_type: 'play'
          } as any);
      } catch (error) {
        console.debug('Play Mode visitor tracking failed:', error);
      }
    };

    // Track visit after a short delay
    const timer = setTimeout(trackVisit, 1000);
    return () => clearTimeout(timer);
  }, [topicId, visitorId]);

  return visitorId;
};
