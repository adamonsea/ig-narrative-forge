import { useEffect } from 'react';

/**
 * Hook to set the page favicon based on the page type
 * @param iconUrl - The URL of the favicon to use (if not provided, uses default Curatr icon)
 */
export const usePageFavicon = (iconUrl?: string | null) => {
  useEffect(() => {
    const faviconPath = iconUrl || '/curatr-icon.png';
    
    try {
      // Update standard favicon
      let faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
      faviconLink.href = faviconPath;

      // Update Apple touch icon
      let appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
      if (!appleTouchIcon) {
        appleTouchIcon = document.createElement('link');
        appleTouchIcon.rel = 'apple-touch-icon';
        document.head.appendChild(appleTouchIcon);
      }
      appleTouchIcon.href = faviconPath;
    } catch (error) {
      console.error('Failed to update favicon:', error);
    }
  }, [iconUrl]);
};
