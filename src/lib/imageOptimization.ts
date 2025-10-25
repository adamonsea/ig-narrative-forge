/**
 * Image optimization utilities for Supabase Storage
 * Generates optimized image URLs with transformations
 */

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

  // Default options for feed cover images
  const {
    width = 800,
    height = 600,
    quality = 80,
    format = 'webp'
  } = options;

  // Check if it's a Supabase Storage URL
  const isSupabaseStorage = url.includes('supabase.co/storage/v1/object/public/');
  
  if (!isSupabaseStorage) {
    // Return original URL if not Supabase Storage
    return url;
  }

  // Build transformation parameters
  const transformParams = new URLSearchParams({
    width: width.toString(),
    height: height.toString(),
    quality: quality.toString(),
    resize: 'cover', // Crop to fit dimensions
  });

  // Add format if not origin
  if (format !== 'origin') {
    transformParams.append('format', format);
  }

  // Insert transformations into the URL
  // Supabase Storage transformation format:
  // /storage/v1/object/public/{bucket}/{path}?transform=...
  const transformedUrl = `${url}${url.includes('?') ? '&' : '?'}${transformParams.toString()}`;

  return transformedUrl;
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
