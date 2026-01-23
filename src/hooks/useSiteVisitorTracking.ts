import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// Generate a visitor ID based on browser fingerprint
const generateVisitorId = (): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx!.textBaseline = 'top';
  ctx!.font = '14px Arial';
  ctx!.fillText('Site visitor tracking', 2, 2);
  
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL()
  ].join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return 'sv_' + Math.abs(hash).toString(36);
};

// Cache country code to avoid repeated API calls
let cachedCountryCode: string | null = null;

/**
 * Fetch visitor's country code using free IP geolocation API
 * Uses ipapi.co which provides 1000 free requests/day
 */
const getCountryCode = async (): Promise<string | null> => {
  if (cachedCountryCode) return cachedCountryCode;
  
  try {
    const response = await fetch('https://ipapi.co/country/', {
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    
    if (response.ok) {
      const countryCode = await response.text();
      // Validate it's a 2-letter code
      if (/^[A-Z]{2}$/.test(countryCode.trim())) {
        cachedCountryCode = countryCode.trim();
        return cachedCountryCode;
      }
    }
  } catch (error) {
    // Silently fail - geolocation is optional
    console.debug('Country detection failed:', error);
  }
  
  return null;
};

interface PageClassification {
  pageType: string;
  topicSlug: string | null;
}

/**
 * Classify a page path into type and extract topic slug if applicable
 */
const classifyPage = (path: string): PageClassification => {
  // Homepage
  if (path === '/' || path === '') {
    return { pageType: 'homepage', topicSlug: null };
  }
  
  // Pricing page
  if (path === '/pricing') {
    return { pageType: 'pricing', topicSlug: null };
  }
  
  // Auth pages
  if (path === '/auth' || path.startsWith('/auth/')) {
    return { pageType: 'auth', topicSlug: null };
  }
  
  // Dashboard pages
  if (path === '/dashboard' || path.startsWith('/dashboard/') || path.startsWith('/topic/')) {
    return { pageType: 'dashboard', topicSlug: null };
  }
  
  // Admin pages
  if (path.startsWith('/admin')) {
    return { pageType: 'admin', topicSlug: null };
  }
  
  // Play mode: /play/:topicSlug (with optional trailing segments)
  const playMatch = path.match(/^\/play\/([^/]+)/);
  if (playMatch) {
    return { pageType: 'play', topicSlug: playMatch[1] };
  }
  
  // Story page: /feed/:topicSlug/story/:storyId
  const storyMatch = path.match(/^\/feed\/([^/]+)\/story\/[^/]+/);
  if (storyMatch) {
    return { pageType: 'story', topicSlug: storyMatch[1] };
  }
  
  // Feed sub-routes: /feed/:topicSlug/(about|archive|daily|weekly|widget|briefings)
  const feedSubRouteMatch = path.match(/^\/feed\/([^/]+)\/(about|archive|daily|weekly|widget|briefings)/);
  if (feedSubRouteMatch) {
    return { pageType: 'feed', topicSlug: feedSubRouteMatch[1] };
  }
  
  // Feed page: /feed/:topicSlug (base feed URL)
  const feedMatch = path.match(/^\/feed\/([^/]+)/);
  if (feedMatch) {
    return { pageType: 'feed', topicSlug: feedMatch[1] };
  }
  
  // Default to other
  return { pageType: 'other', topicSlug: null };
};

// Cache for topic slug -> ID mapping
const topicIdCache = new Map<string, string>();

/**
 * Hook to track site-wide visitor activity on ALL pages
 * Unlike useVisitorTracking, this doesn't require a topicId
 */
export const useSiteVisitorTracking = () => {
  const location = useLocation();
  const hasTracked = useRef<Set<string>>(new Set());
  const visitorId = useRef<string>(generateVisitorId());

  useEffect(() => {
    const pagePath = location.pathname;
    const today = new Date().toISOString().split('T')[0];
    const trackKey = `${pagePath}:${today}`;
    
    // Skip if already tracked this path today
    if (hasTracked.current.has(trackKey)) return;
    hasTracked.current.add(trackKey);

    const trackVisit = async () => {
      try {
        const { pageType, topicSlug } = classifyPage(pagePath);
        
        // Fetch country code and topic ID in parallel
        const [countryCode, topicId] = await Promise.all([
          getCountryCode(),
          resolveTopicId(topicSlug)
        ]);

        // Insert the visit record
        await supabase
          .from('site_visits')
          .upsert({
            visitor_id: visitorId.current,
            page_path: pagePath,
            page_type: pageType,
            topic_id: topicId,
            user_agent: navigator.userAgent,
            referrer: document.referrer || null,
            visit_date: today,
            country_code: countryCode
          }, {
            onConflict: 'visitor_id,page_path,visit_date',
            ignoreDuplicates: true
          });
      } catch (error) {
        console.debug('Site visit tracking failed:', error);
      }
    };
    
    // Helper to resolve topic slug to ID (case-insensitive)
    async function resolveTopicId(topicSlug: string | null): Promise<string | null> {
      if (!topicSlug) return null;
      
      // Normalize to lowercase for consistent caching
      const normalizedSlug = topicSlug.toLowerCase();
      
      // Check cache first
      if (topicIdCache.has(normalizedSlug)) {
        return topicIdCache.get(normalizedSlug) || null;
      }
      
      // Case-insensitive lookup using ilike
      const { data: topic } = await supabase
        .from('topics')
        .select('id')
        .ilike('slug', normalizedSlug)
        .maybeSingle();
      
      if (topic?.id) {
        topicIdCache.set(normalizedSlug, topic.id);
        return topic.id;
      }
      
      return null;
    }

    // Track after a brief delay to ensure page is loaded
    const timer = setTimeout(trackVisit, 150);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return visitorId.current;
};
