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

  // Check if it's a Supabase Storage URL that can be transformed
  const isSupabaseStorage = url.includes('supabase.co/storage/v1/object/public/');
  
  if (!isSupabaseStorage) {
    // Return original URL if not Supabase Storage
    return url;
  }

  // Note: Supabase Image Transformations require Pro Plan or above.
  // The /render/image/ endpoint is only available on paid plans.
  // For now, return original URL until Pro plan is confirmed.
  // To enable optimization: uncomment the transformation code below
  // and ensure the Supabase project is on Pro plan or above.
  
  // TODO: Enable when Pro plan is active
  // Convert to render/image endpoint for transformations
  // /storage/v1/object/public/{bucket}/{path} → /storage/v1/render/image/public/{bucket}/{path}
  // const renderUrl = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  // const transformParams = new URLSearchParams({
  //   width: width.toString(),
  //   height: height.toString(),
  //   quality: quality.toString(),
  //   resize: 'cover',
  // });
  // if (format !== 'origin') {
  //   transformParams.append('format', format);
  // }
  // return `${renderUrl}?${transformParams.toString()}`;
  
  // Return original URL (no transformation on Free plan)
  return url;
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
