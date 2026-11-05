import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorId, isLikelyBot } from '@/lib/visitorIdentity';

export const useVisitorTracking = (topicId: string | undefined, pageType: string = 'feed') => {
  const [visitorId, setVisitorId] = useState<string>('');
  const hasTrackedClick = useRef(false);
  const hasTrackedVisit = useRef(false);

  useEffect(() => {
    // Generate visitor ID once on mount
    if (isLikelyBot()) return;
    const id = getVisitorId('visitor');
    setVisitorId(id);
  }, []);

  useEffect(() => {
    if (!topicId || !visitorId) return;

    const userAgent = navigator.userAgent;
    const referrer = document.referrer;

    // Track raw click immediately (for GSC parity)
    const trackClick = async () => {
      if (hasTrackedClick.current) return;
      hasTrackedClick.current = true;
      
      try {
        await supabase
          .from('feed_clicks')
          .insert({
            topic_id: topicId,
            visitor_id: visitorId,
            user_agent: userAgent,
            referrer: referrer || null,
            page_type: pageType
          });
      } catch (error) {
        console.debug('Click tracking failed:', error);
      }
    };

    // Track unique visit (deduplicated daily)
    const trackVisit = async () => {
      if (hasTrackedVisit.current) return;
      hasTrackedVisit.current = true;
      
      try {
        await supabase
          .from('feed_visits')
          .upsert({
            topic_id: topicId,
            visitor_id: visitorId,
            user_agent: userAgent,
            referrer: referrer || null,
            visit_date: new Date().toISOString().split('T')[0],
            page_type: pageType
          }, {
            onConflict: 'topic_id,visitor_id,visit_date,page_type',
            ignoreDuplicates: true
          });
      } catch (error) {
        console.debug('Visitor tracking failed:', error);
      }
    };

    // Track click immediately (reduced from 1s to 100ms)
    const clickTimer = setTimeout(trackClick, 100);
    
    // Track unique visit after brief delay
    const visitTimer = setTimeout(trackVisit, 150);

    // Backup: track on page unload for quick bounces
    const handleBeforeUnload = () => {
      if (!hasTrackedClick.current) {
        // Use sendBeacon for reliable tracking during page unload
        const payload = JSON.stringify({
          topic_id: topicId,
          visitor_id: visitorId,
          user_agent: userAgent,
          referrer: referrer || null,
          page_type: pageType
        });
        navigator.sendBeacon?.(
          `https://fpoywkjgdapgjtdeooak.supabase.co/rest/v1/feed_clicks`,
          new Blob([payload], { type: 'application/json' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(clickTimer);
      clearTimeout(visitTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [topicId, visitorId, pageType]);

  return visitorId;
};