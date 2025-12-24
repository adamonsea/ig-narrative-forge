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

type DeviceTier = 'high' | 'medium' | 'low';

/**
 * Detect device performance tier for adaptive image quality
 */
function getImageDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') return 'medium';
  
  const memory = (navigator as any).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  
  // High-end: 8GB+ RAM or 8+ cores
  if ((memory && memory >= 8) || cores >= 8) return 'high';
  // Low-end: <4GB RAM or <4 cores
  if ((memory && memory < 4) || cores < 4) return 'low';
  return 'medium';
}

/**
 * Get quality based on device tier and network
 */
function getAdaptiveQuality(baseQuality: number): number {
  const tier = getImageDeviceTier();
  const connection = (navigator as any).connection;
  const saveData = connection?.saveData;
  const effectiveType = connection?.effectiveType;
  
  // Data saver mode: aggressive compression
  if (saveData) return Math.min(baseQuality - 20, 50);
  
  // Slow connection: reduce quality
  if (effectiveType === '2g' || effectiveType === 'slow-2g') return Math.min(baseQuality - 15, 55);
  if (effectiveType === '3g') return Math.min(baseQuality - 5, 70);
  
  // Adjust by device tier
  if (tier === 'low') return Math.min(baseQuality - 10, 65);
  if (tier === 'high') return Math.min(baseQuality + 5, 90);
  
  return baseQuality;
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
  const transformedUrl = `${url}${url.includes('?') ? '&' : '?'}${transformParams.toString()}`;

  return transformedUrl;
}

/**
 * Generate srcset for responsive images
 * @param url - The original image URL
 * @param options - Base optimization options
 * @returns srcset string for responsive images
 */
export function generateResponsiveSrcSet(
  url: string | null | undefined,
  options: { aspectRatio?: number; quality?: number } = {}
): string {
  if (!url) return '';

  const { aspectRatio = 0.75, quality = 75 } = options;
  const widths = [320, 480, 640, 800, 1024, 1280];
  
  const srcset = widths
    .map(width => {
      const optimizedUrl = optimizeImageUrl(url, { 
        width, 
        height: Math.round(width * aspectRatio),
        quality,
        format: 'webp'
      });
      return optimizedUrl ? `${optimizedUrl} ${width}w` : null;
    })
    .filter(Boolean)
    .join(', ');

  return srcset;
}

/**
 * Get responsive sizes attribute based on container context
 */
export function getResponsiveSizes(context: 'carousel' | 'thumbnail' | 'hero' = 'carousel'): string {
  switch (context) {
    case 'hero':
      return '100vw';
    case 'thumbnail':
      return '(max-width: 640px) 50vw, 200px';
    case 'carousel':
    default:
      return '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 800px';
  }
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

/**
 * Generate optimized video poster URL
 */
export function optimizeVideoPosterUrl(url: string | null | undefined): string | null {
  return optimizeImageUrl(url, {
    width: 800,
    height: 600,
    quality: 70,
    format: 'webp'
  });
}

/**
 * Preload critical images for faster LCP
 */
export function preloadImage(url: string | null | undefined, options?: ImageOptimizationOptions): void {
  if (!url) return;
  
  const optimizedUrl = optimizeImageUrl(url, options);
  if (!optimizedUrl) return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = optimizedUrl;
  link.type = 'image/webp';
  document.head.appendChild(link);
}
