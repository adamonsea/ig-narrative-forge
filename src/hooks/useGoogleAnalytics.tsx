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

    // Wait for React Helmet to update the document title before sending to GA
    const timeoutId = setTimeout(() => {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: location.pathname + location.search,
        page_title: document.title, // Explicitly pass the updated title
      });
    }, 100);

    return () => clearTimeout(timeoutId);
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
