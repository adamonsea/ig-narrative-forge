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
 * e.g. "https://www.theargus.co.uk/news/123" -> "The Argus"
 *      "bbc.co.uk" -> "BBC"
 *      "eastbournereporter.co.uk" -> "Eastbourne Reporter"
 * Returns '' when nothing usable can be derived.
 */
const KNOWN_PUBLICATIONS: Record<string, string> = {
  'bbc.co.uk': 'BBC',
  'bbc.com': 'BBC',
  'theguardian.com': 'The Guardian',
  'theargus.co.uk': 'The Argus',
  'sussexexpress.co.uk': 'Sussex Express',
  'eastbourneherald.co.uk': 'Eastbourne Herald',
  'eastbournereporter.co.uk': 'Eastbourne Reporter',
  'bournefreelive.co.uk': 'Bourne Free Live',
  'eastbourne.gov.uk': 'Eastbourne Borough Council',
  'lewes-eastbourne.gov.uk': 'Lewes & Eastbourne Councils',
  'eastsussex.gov.uk': 'East Sussex County Council',
  'wealden.gov.uk': 'Wealden District Council',
  'hailsham-tc.gov.uk': 'Hailsham Town Council',
  'parliament.uk': 'UK Parliament',
  'gov.uk': 'GOV.UK',
  'sussex.police.uk': 'Sussex Police',
  'eastbourneunltd.co.uk': 'Eastbourne Chamber',
  'itv.com': 'ITV News',
  'sky.com': 'Sky News',
  'independent.co.uk': 'The Independent',
  'telegraph.co.uk': 'The Telegraph',
  'thetimes.co.uk': 'The Times',
  'standard.co.uk': 'Evening Standard',
};

/** Multi-label public suffixes we must skip to reach the real domain name. */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'net.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'sch.uk', 'police.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.br', 'co.jp', 'co.in', 'com.tr',
]);

/** Words commonly glued onto a place name in UK publication domains. */
const PUBLICATION_WORDS = [
  'reporter', 'herald', 'express', 'gazette', 'chronicle', 'observer', 'journal', 'advertiser',
  'telegraph', 'tribune', 'courier', 'mercury', 'echo', 'argus', 'standard', 'bulletin',
  'news', 'times', 'post', 'today', 'online', 'live', 'daily', 'weekly', 'radio', 'press',
];

const titleCase = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/** Split "eastbournereporter" into "Eastbourne Reporter" when a known word is glued on the end. */
const splitGluedWords = (name: string): string => {
  for (const word of PUBLICATION_WORDS) {
    if (name.length > word.length + 2 && name.endsWith(word)) {
      const head = name.slice(0, name.length - word.length);
      return `${titleCase(head)} ${titleCase(word)}`;
    }
  }
  return titleCase(name);
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

  const parts = host.split('.');

  // Match a known publication ignoring any subdomain (e.g. news.bbc.co.uk).
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (KNOWN_PUBLICATIONS[candidate]) return KNOWN_PUBLICATIONS[candidate];
  }

  // Skip multi-label public suffixes such as .co.uk so we never return "Co" or "Gov".
  const lastTwo = parts.slice(-2).join('.');
  const suffixLength = MULTI_PART_SUFFIXES.has(lastTwo) ? 2 : 1;
  const name = parts.length > suffixLength ? parts[parts.length - suffixLength - 1] : parts[0];
  if (!name) return '';

  // Hyphenated domains are already word-separated.
  if (name.includes('-')) {
    return name.split('-').filter(Boolean).map(titleCase).join(' ');
  }

  return splitGluedWords(name);
};

/** Stored names that are really fragments of a web address, not a publication. */
const UNUSABLE_NAMES = new Set([
  'co', 'gov', 'org', 'net', 'com', 'uk', 'www', 'news', 'site', 'web', 'home', 'index',
  'unknown', 'unknown source', 'n/a', 'null', 'undefined',
]);

/**
 * Best label for a story's source: prefer the stored publication name, but fall back to the
 * domain when the stored value is a fragment ("Co", "Gov") or looks like a bare domain.
 */
export const resolvePublicationName = (
  storedName?: string | null,
  sourceUrl?: string | null
): string => {
  const derived = publicationFromUrl(sourceUrl);
  const stored = (storedName || '').trim();

  if (!stored) return derived;
  if (UNUSABLE_NAMES.has(stored.toLowerCase())) return derived || stored;
  // "sussexexpress.co.uk" stored as a name — run it through the domain formatter.
  if (/^[a-z0-9-]+(\.[a-z]{2,})+$/i.test(stored)) return publicationFromUrl(stored) || derived || stored;
  return stored;
};


