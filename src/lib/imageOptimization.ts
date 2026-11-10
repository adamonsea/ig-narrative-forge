/**
 * Image optimization utilities for Supabase Storage
 * Generates optimized image URLs with transformations
 */

/** Story covers are generated at 1536×1024, i.e. 3:2. */
export const COVER_ASPECT = 3 / 2;

/**
 * Pixel width to request for a cover shown `cssWidth` CSS pixels wide.
 * Accounts for screen density (capped at 2× to keep downloads light) and
 * rounds up to 160px steps so nearby sizes share one cached copy.
 */
export function coverPixelWidth(cssWidth: number, maxWidth = 1280): number {
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 2;
  const px = Math.ceil((Math.max(cssWidth, 80) * dpr) / 160) * 160;
  return Math.min(px, maxWidth);
}

interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'origin';
}

/**
 * Optimizes a Supabase Storage image URL with transformations
 * @param url - The original image URL
 * @param options - Optimization options (width, height, quality, format)
 * @returns Optimized image URL with transformations
 */
export function optimizeImageUrl(
  url: string | null | undefined,
  options: ImageOptimizationOptions = {}
): string | null {
  if (!url) return null;

  // Default options for feed cover images. When only a width is given, keep the
  // covers' own 3:2 shape — a mismatched height makes the server crop the
  // picture before the page crops it again (Swipe was showing a zoomed sliver).
  const {
    width = 800,
    height = options.width ? Math.round(options.width / COVER_ASPECT) : 600,
    quality = 80,
    format = 'webp'
  } = options;

  // Check if it's a Supabase Storage URL that can be transformed
  const isSupabaseStorage = url.includes('supabase.co/storage/v1/object/public/');
  
  if (!isSupabaseStorage) {
    // Return original URL if not Supabase Storage
    return url;
  }

  // Supabase Image Transformation: serve a resized copy instead of the original
  // (dashboard thumbnails were previously pulling full multi-megabyte uploads).
  // /storage/v1/object/public/{bucket}/{path} → /storage/v1/render/image/public/{bucket}/{path}
  const renderUrl = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const transformParams = new URLSearchParams({
    width: width.toString(),
    height: height.toString(),
    quality: quality.toString(),
    resize: 'cover',
  });
  if (format !== 'origin') {
    transformParams.append('format', format);
  }
  return `${renderUrl}?${transformParams.toString()}`;
}

/**
 * Generate srcset for responsive images
 * @param url - The original image URL
 * @returns srcset string for responsive images
 */
export function generateResponsiveSrcSet(url: string | null | undefined): string {
  if (!url) return '';

  const widths = [400, 800, 1200, 1600];
  const srcset = widths
    .map(width => {
      const optimizedUrl = optimizeImageUrl(url, { width, height: Math.round(width * 0.75) });
      return optimizedUrl ? `${optimizedUrl} ${width}w` : null;
    })
    .filter(Boolean)
    .join(', ');

  return srcset;
}

/**
 * Generate a thumbnail-optimized image URL for pile/grid views
 * Smaller dimensions and lower quality for performance with many images
 */
export function optimizeThumbnailUrl(url: string | null | undefined): string | null {
  return optimizeImageUrl(url, {
    width: 200,
    height: 150,
    quality: 60,
    format: 'webp'
  });
}
