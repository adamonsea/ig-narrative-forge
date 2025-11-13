import { useEffect } from 'react';

/**
 * Hook to safely update the page favicon based on topic branding
 * @param iconUrl - The URL of the favicon to use
 */
export const useTopicFavicon = (iconUrl?: string | null) => {
  useEffect(() => {
    if (!iconUrl) return;

    try {
      // Update standard favicon
      let faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
      faviconLink.href = iconUrl;

      // Update Apple touch icon
      let appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
      if (!appleTouchIcon) {
        appleTouchIcon = document.createElement('link');
        appleTouchIcon.rel = 'apple-touch-icon';
        document.head.appendChild(appleTouchIcon);
      }
      appleTouchIcon.href = iconUrl;
    } catch (error) {
      console.error('Failed to update favicon:', error);
    }
  }, [iconUrl]);
};
