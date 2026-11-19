import { useEffect } from 'react';
import { getFaviconUrl, getPwaIconUrl } from '@/lib/brandingImageUtils';
import { restoreCuratrIcons, setFeedIcons } from '@/lib/documentIcons';

interface BrandingConfig {
  icon_url?: string;
  logo_url?: string;
  icon_variants?: Record<string, string>;
  logo_variants?: Record<string, string>;
}

/**
 * Feed pages show the feed's app icon (Brand → icon) in the browser tab and on the home
 * screen, falling back to its logo; leaving the page puts Curatr's icons back.
 * @param branding - The branding config object or icon URL string for backwards compatibility
 */
export const useTopicFavicon = (branding?: BrandingConfig | string | null) => {
  let faviconUrl: string | null = null;
  let appleTouchUrl: string | null = null;
  if (typeof branding === 'string') {
    faviconUrl = branding;
    appleTouchUrl = branding;
  } else if (branding) {
    faviconUrl = getFaviconUrl(branding) || branding.icon_url || branding.logo_url || null;
    appleTouchUrl = getPwaIconUrl(branding, '192') || branding.icon_url || branding.logo_url || null;
  }

  useEffect(() => {
    if (!faviconUrl) return;
    try {
      setFeedIcons(faviconUrl, appleTouchUrl);
    } catch (error) {
      console.error('Failed to update favicon:', error);
    }
    return () => {
      try { restoreCuratrIcons(); } catch { /* ignore */ }
    };
  }, [faviconUrl, appleTouchUrl]);
};
