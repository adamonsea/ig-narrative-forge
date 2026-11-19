import { useEffect } from 'react';
import { restoreCuratrIcons, setFeedIcons } from '@/lib/documentIcons';

/**
 * Hook to set the page favicon based on the page type
 * @param iconUrl - The URL of the favicon to use (if not provided, uses Curatr's own icons)
 */
export const usePageFavicon = (iconUrl?: string | null) => {
  useEffect(() => {
    try {
      if (iconUrl) setFeedIcons(iconUrl);
      else restoreCuratrIcons();
    } catch (error) {
      console.error('Failed to update favicon:', error);
    }
  }, [iconUrl]);
};
