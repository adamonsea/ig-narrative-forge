import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getVariant, isTestActive } from '@/lib/abTesting';

interface UseABTestTrackingOptions {
  testName: string;
  visitorId: string;
  topicId?: string;
  trackImpression?: boolean;
}

/**
 * Hook for tracking A/B test events (impressions and clicks)
 * 
 * Automatically tracks impression on mount if trackImpression is true.
 * Provides a trackClick function for manual click tracking.
 */
export function useABTestTracking({
  testName,
  visitorId,
  topicId,
  trackImpression = true,
}: UseABTestTrackingOptions) {
  const hasTrackedImpression = useRef(false);
  const variant = getVariant(testName, visitorId);
  const isActive = isTestActive(testName);

  // Track an event (non-blocking)
  const trackEvent = useCallback(async (eventType: 'impression' | 'click') => {
    if (!isActive || !visitorId) return;

    try {
      await supabase.from('ab_test_events').insert({
        test_name: testName,
        variant,
        event_type: eventType,
        visitor_id: visitorId,
        topic_id: topicId || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
    } catch (error) {
      // Silent fail - don't impact user experience
      console.debug('A/B test tracking error:', error);
    }
  }, [testName, variant, visitorId, topicId, isActive]);

  // Track impression on mount (once per component lifecycle)
  useEffect(() => {
    if (trackImpression && !hasTrackedImpression.current && isActive && visitorId) {
      hasTrackedImpression.current = true;
      trackEvent('impression');
    }
  }, [trackImpression, trackEvent, isActive, visitorId]);

  // Manual click tracker
  const trackClick = useCallback(() => {
    trackEvent('click');
  }, [trackEvent]);

  return {
    variant,
    isActive,
    trackClick,
  };
}
