/**
 * Centralized branding constants for the entire application.
 * Use these everywhere to ensure consistency.
 */

export const BRAND = {
  // Primary brand name (user-facing)
  name: 'Curatr',
  
  // Full product name
  fullName: 'eeZee News',
  
  // Tagline
  tagline: 'Your news, curated',
  
  // Domain (without protocol)
  domain: 'curatr.pro',
  
  // Full production URL
  productionUrl: 'https://curatr.pro',
  
  // SEO site name
  siteName: 'Curatr',
  
  // Organization name for structured data
  organizationName: 'Curatr',
  
  // Logo URL
  logoUrl: 'https://curatr.pro/placeholder.svg',
  
  // Social handles
  social: {
    twitter: '@curatr',
  },
  
  // Local storage key prefixes
  storagePrefix: 'curatr_',
} as const;

// Helper to get localStorage key with proper prefix
export const getStorageKey = (key: string): string => {
  return `${BRAND.storagePrefix}${key}`;
};

// Helper to get the production URL (with fallback for SSR)
export const getProductionUrl = (): string => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    // Use actual origin if it's a known production domain
    if (origin.includes('curatr.pro') || origin.includes('lovable.app')) {
      return origin.startsWith('https://') ? origin : origin.replace('http://', 'https://');
    }
    // For local dev, return as-is
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }
  }
  return BRAND.productionUrl;
};
