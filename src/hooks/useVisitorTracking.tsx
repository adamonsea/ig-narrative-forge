import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Generate a visitor ID based on browser fingerprint and IP approximation
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
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return 'visitor_' + Math.abs(hash).toString(36);
};

export const useVisitorTracking = (topicId: string | undefined) => {
  useEffect(() => {
    if (!topicId) return;

    const trackVisit = async () => {
      try {
        const visitorId = generateVisitorId();
        const userAgent = navigator.userAgent;
        const referrer = document.referrer;

        await supabase.rpc('record_feed_visit', {
          p_topic_id: topicId,
          p_visitor_id: visitorId,
          p_user_agent: userAgent,
          p_referrer: referrer || null
        });
      } catch (error) {
        // Silent fail - don't disrupt user experience
        console.debug('Visitor tracking failed:', error);
      }
    };

    // Track visit after a short delay to ensure page has loaded
    const timer = setTimeout(trackVisit, 1000);
    return () => clearTimeout(timer);
  }, [topicId]);
};