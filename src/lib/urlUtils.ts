/**
 * URL utilities for ensuring proper HTTPS protocol in share links.
 * iOS WhatsApp requires explicit https:// prefix for links to be recognized as clickable.
 */

import { BRAND, getProductionUrl } from './constants/branding';

/**
 * Get the production base URL with guaranteed https:// prefix.
 * This is essential for iOS WhatsApp compatibility.
 */
export const getShareBaseUrl = (): string => {
  // Use the centralized production URL getter
  return getProductionUrl();
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

/**
 * Derive a human-friendly publication name from a URL or bare domain.
 * e.g. "https://www.theargus.co.uk/news/123" -> "Theargus"
 *      "bbc.co.uk" -> "BBC"
 * Returns '' when nothing usable can be derived.
 */
const KNOWN_PUBLICATIONS: Record<string, string> = {
  'bbc.co.uk': 'BBC',
  'bbc.com': 'BBC',
  'theguardian.com': 'The Guardian',
  'theargus.co.uk': 'The Argus',
  'sussexexpress.co.uk': 'Sussex Express',
  'eastbourneherald.co.uk': 'Eastbourne Herald',
};

export const publicationFromUrl = (input?: string | null): string => {
  if (!input) return '';
  let host = input.trim();
  try {
    host = new URL(input.includes('://') ? input : `https://${input}`).hostname;
  } catch {
    // input may already be a bare domain; fall through
  }
  host = host.replace(/^www\./i, '').toLowerCase();
  if (!host) return '';

  if (KNOWN_PUBLICATIONS[host]) return KNOWN_PUBLICATIONS[host];

  // Take the registrable name (segment before the public suffix).
  const parts = host.split('.');
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
};
