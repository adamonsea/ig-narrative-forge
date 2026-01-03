import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    gtag: (command: string, ...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = 'G-C9VCW1ZPGR';

/**
 * Hook to track page views in Google Analytics for SPA navigation
 */
export const useGoogleAnalytics = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag !== 'function') return;

    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: location.pathname + location.search,
    });
  }, [location]);
};

/**
 * Track custom events in Google Analytics
 */
export const trackEvent = (
  eventName: string,
  parameters?: Record<string, unknown>
) => {
  if (typeof window.gtag !== 'function') return;
  
  window.gtag('event', eventName, parameters);
};
