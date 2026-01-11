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
  
  // Play mode: /play/:topicSlug
  const playMatch = path.match(/^\/play\/([^/]+)$/);
  if (playMatch) {
    return { pageType: 'play', topicSlug: playMatch[1] };
  }
  
  // Story page: /feed/:topicSlug/story/:storyId
  const storyMatch = path.match(/^\/feed\/([^/]+)\/story\/[^/]+$/);
  if (storyMatch) {
    return { pageType: 'story', topicSlug: storyMatch[1] };
  }
  
  // Feed page: /feed/:topicSlug
  const feedMatch = path.match(/^\/feed\/([^/]+)$/);
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
        
        // Resolve topic ID if we have a slug
        let topicId: string | null = null;
        if (topicSlug) {
          // Check cache first
          if (topicIdCache.has(topicSlug)) {
            topicId = topicIdCache.get(topicSlug) || null;
          } else {
            // Look up topic ID from slug
            const { data: topic } = await supabase
              .from('topics')
              .select('id')
              .eq('slug', topicSlug)
              .maybeSingle();
            
            if (topic?.id) {
              topicId = topic.id;
              topicIdCache.set(topicSlug, topic.id);
            }
          }
        }

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
            visit_date: today
          }, {
            onConflict: 'visitor_id,page_path,visit_date',
            ignoreDuplicates: true
          });
      } catch (error) {
        console.debug('Site visit tracking failed:', error);
      }
    };

    // Track after a brief delay to ensure page is loaded
    const timer = setTimeout(trackVisit, 150);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return visitorId.current;
};
