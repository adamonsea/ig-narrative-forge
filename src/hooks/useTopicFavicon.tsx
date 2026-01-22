import { useEffect } from 'react';
import { getFaviconUrl, getPwaIconUrl } from '@/lib/brandingImageUtils';

interface BrandingConfig {
  icon_url?: string;
  logo_url?: string;
  icon_variants?: Record<string, string>;
  logo_variants?: Record<string, string>;
}

/**
 * Hook to safely update the page favicon based on topic branding
 * Automatically uses optimized icon variants when available
 * @param branding - The branding config object or icon URL string for backwards compatibility
 */
export const useTopicFavicon = (branding?: BrandingConfig | string | null) => {
  useEffect(() => {
    if (!branding) return;

    let faviconUrl: string | null = null;
    let appleTouchUrl: string | null = null;

    // Handle both old string format and new branding config object
    if (typeof branding === 'string') {
      faviconUrl = branding;
      appleTouchUrl = branding;
    } else {
      // Use optimized variants when available
      faviconUrl = getFaviconUrl(branding) || branding.icon_url || branding.logo_url || null;
      appleTouchUrl = getPwaIconUrl(branding, '192') || branding.icon_url || branding.logo_url || null;
    }

    if (!faviconUrl) return;

    try {
      // Update standard favicon (use smallest optimized version)
      let faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
      faviconLink.href = faviconUrl;

      // Update Apple touch icon (use 192px version for better quality on iOS)
      let appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
      if (!appleTouchIcon) {
        appleTouchIcon = document.createElement('link');
        appleTouchIcon.rel = 'apple-touch-icon';
        document.head.appendChild(appleTouchIcon);
      }
      appleTouchIcon.href = appleTouchUrl || faviconUrl;
    } catch (error) {
      console.error('Failed to update favicon:', error);
    }
  }, [branding]);
};
