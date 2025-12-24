/**
 * URL utilities for ensuring proper HTTPS protocol in share links.
 * iOS WhatsApp requires explicit https:// prefix for links to be recognized as clickable.
 */

/**
 * Get the production base URL with guaranteed https:// prefix.
 * This is essential for iOS WhatsApp compatibility.
 */
export const getShareBaseUrl = (): string => {
  // In production, always use https
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    
    // If already https, return as-is
    if (origin.startsWith('https://')) {
      return origin;
    }
    
    // If http (localhost/dev), convert to https for production domain
    // or keep as-is for local development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin; // Keep local URLs as-is for development
    }
    
    // For any other http URL, ensure https
    return origin.replace('http://', 'https://');
  }
  
  // Fallback for SSR or non-browser environments
  return 'https://curatr.io';
};

/**
 * Ensure a URL has https:// prefix.
 * Essential for iOS WhatsApp link recognition.
 */
export const ensureHttpsUrl = (url: string): string => {
  if (!url) return url;
  
  // Already has https
  if (url.startsWith('https://')) {
    return url;
  }
  
  // Has http, convert to https (except localhost)
  if (url.startsWith('http://')) {
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return url; // Keep local URLs for development
    }
    return url.replace('http://', 'https://');
  }
  
  // No protocol, add https
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  
  // Relative URL or other, prefix with https://
  if (!url.includes('://')) {
    return `https://${url}`;
  }
  
  return url;
};

/**
 * Build a share URL with guaranteed https:// prefix.
 * Use this for all WhatsApp and social share links.
 */
export const buildShareUrl = (path: string): string => {
  const baseUrl = getShareBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
