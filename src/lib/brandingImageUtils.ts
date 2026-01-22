/**
 * Utilities for optimized branding image URLs
 * Automatically selects the best variant based on usage context
 */

interface BrandingConfig {
  logo_url?: string;
  icon_url?: string;
  logo_variants?: Record<string, string>;
  icon_variants?: Record<string, string>;
  subheader?: string;
  show_topic_name?: boolean;
}

type LogoVariant = 'original' | 'header' | 'thumbnail' | 'email';
type IconVariant = 'original' | 'pwa-512' | 'pwa-192' | 'favicon' | 'widget' | 'notification';

/**
 * Get the optimized logo URL for a specific use case
 */
export function getOptimizedLogoUrl(
  branding: BrandingConfig | null | undefined,
  variant: LogoVariant = 'original'
): string | null {
  if (!branding?.logo_url) return null;
  
  // If variants exist, use them
  if (branding.logo_variants?.[variant]) {
    return branding.logo_variants[variant];
  }
  
  // Fallback to original
  return branding.logo_url;
}

/**
 * Get the optimized icon URL for a specific use case
 */
export function getOptimizedIconUrl(
  branding: BrandingConfig | null | undefined,
  variant: IconVariant = 'original'
): string | null {
  if (!branding?.icon_url) return null;
  
  // If variants exist, use them
  if (branding.icon_variants?.[variant]) {
    return branding.icon_variants[variant];
  }
  
  // Fallback to original
  return branding.icon_url;
}

/**
 * Get the best favicon URL (smallest optimized icon)
 */
export function getFaviconUrl(branding: BrandingConfig | null | undefined): string | null {
  return getOptimizedIconUrl(branding, 'favicon') || 
         getOptimizedIconUrl(branding, 'widget') ||
         getOptimizedLogoUrl(branding, 'thumbnail');
}

/**
 * Get the best PWA icon URL (192x192 for manifest)
 */
export function getPwaIconUrl(branding: BrandingConfig | null | undefined, size: '192' | '512' = '192'): string | null {
  const variant = size === '512' ? 'pwa-512' : 'pwa-192';
  return getOptimizedIconUrl(branding, variant);
}

/**
 * Get the best notification icon URL
 */
export function getNotificationIconUrl(branding: BrandingConfig | null | undefined): string | null {
  return getOptimizedIconUrl(branding, 'notification') || 
         getOptimizedIconUrl(branding, 'pwa-192');
}

/**
 * Get the best widget avatar URL
 */
export function getWidgetAvatarUrl(branding: BrandingConfig | null | undefined): string | null {
  return getOptimizedIconUrl(branding, 'widget') || 
         getOptimizedIconUrl(branding, 'favicon') ||
         getOptimizedLogoUrl(branding, 'thumbnail');
}

/**
 * Get the best header logo URL
 */
export function getHeaderLogoUrl(branding: BrandingConfig | null | undefined): string | null {
  return getOptimizedLogoUrl(branding, 'header');
}

/**
 * Get the best email logo URL
 */
export function getEmailLogoUrl(branding: BrandingConfig | null | undefined): string | null {
  return getOptimizedLogoUrl(branding, 'email') || 
         getOptimizedLogoUrl(branding, 'header');
}
