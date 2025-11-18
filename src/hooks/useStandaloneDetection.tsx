import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Detects when the PWA is running in standalone mode (installed to homescreen)
 * and tracks this as an install event on first launch
 */
export const useStandaloneDetection = (topicId: string | undefined, visitorId: string) => {
  useEffect(() => {
    if (!topicId || !visitorId) return;

    const trackStandaloneInstall = async () => {
      try {
        // Check if running in standalone mode (installed to homescreen)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                           (window.navigator as any).standalone === true;

        if (!isStandalone) return;

        // Check if we've already tracked this install
        const storageKey = `pwa-install-tracked-${topicId}`;
        const alreadyTracked = localStorage.getItem(storageKey);
        
        if (alreadyTracked) return;

        console.log('Detected standalone launch - tracking PWA install for topic:', topicId);

        // Track the install
        await supabase.functions.invoke('track-engagement-metric', {
          body: {
            topicId,
            visitorId,
            metricType: 'pwa_installed',
            userAgent: navigator.userAgent,
          }
        });

        // Mark as tracked so we don't double-count
        localStorage.setItem(storageKey, Date.now().toString());
        
        console.log('Successfully tracked PWA standalone install');
      } catch (error) {
        console.error('Error tracking standalone install:', error);
      }
    };

    // Track on mount if in standalone mode
    trackStandaloneInstall();
  }, [topicId, visitorId]);
};
