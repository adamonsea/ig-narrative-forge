import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getContextAwareTimeout, isInAppBrowser, isGmailWebView } from '@/lib/deviceUtils';
import { getCachedFeed, setCachedFeed, isCacheFresh, CachedStory, CachedTopic } from '@/lib/feedCache';
interface Story {
  id: string;
  title: string;
  author: string;
  publication_name: string;
  created_at: string;
  updated_at: string;
  cover_illustration_url?: string;
  animated_illustration_url?: string;
  cover_illustration_prompt?: string;
  popularity_data?: {
    period_type: string;
    swipe_count: number;
    rank_position: number;
  };
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
    word_count: number;
    visual?: {
      image_url: string;
      alt_text: string;
    };
  }>;
  article: {
    source_url: string;
    published_at: string;
    region: string;
  };
  is_parliamentary?: boolean;
  mp_name?: string;
  mp_names?: string[]; // all MPs associated with this story (aggregated)
  mp_party?: string;
  constituency?: string;
  tone?: 'formal' | 'conversational' | 'engaging' | 'satirical';
}

interface Topic {
  id: string;
  name: string;
  description: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  landmarks: string[];
  organizations: string[];
  slug?: string;
  region?: string;
  is_public: boolean;
  created_by: string;
  parliamentary_tracking_enabled?: boolean;
  events_enabled?: boolean;
  community_intelligence_enabled?: boolean;
  community_pulse_frequency?: number;
  automated_insights_enabled?: boolean;
  branding_config?: {
    logo_url?: string;
    subheader?: string;
    show_topic_name?: boolean;
    icon_url?: string;
  };
  donation_enabled?: boolean;
  donation_config?: {
    button_text: string;
    tiers: Array<{
      name: string;
      amount: string;
      stripe_payment_link: string;
      description?: string;
    }>;
  };
}

interface KeywordCount {
  keyword: string;
  count: number;
}

interface SourceCount {
  source_name: string;
  source_domain: string;
  count: number;
}

interface FilterStoryIndexEntry {
  id: string;
  sourceDomain: string | null;
  keywordMatches: string[];
}

const STORIES_PER_PAGE = 20; // Increased to load more stories per page
const DEBOUNCE_DELAY_MS = 300; // Debounce to prevent rapid server calls and race conditions

// Feed content interface - stories only (parliamentary content moved to insight cards)
interface FeedContent {
  type: 'story';
  id: string;
  content_date: string; // Used for chronological sorting
  data: Story;
}

export const useHybridTopicFeedWithKeywords = (slug: string) => {
  // Base data state
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [allContent, setAllContent] = useState<FeedContent[]>([]);
  const [filteredContent, setFilteredContent] = useState<FeedContent[]>([]);
  
  // New stories notification state
  const [hasNewStories, setHasNewStories] = useState(false);
  const [newStoryCount, setNewStoryCount] = useState(0);
  const [topic, setTopic] = useState<Topic | null>(null);
  
  // Split loading states for instant header rendering
  const [topicLoading, setTopicLoading] = useState(true);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // Background refresh indicator
  
  // Legacy combined loading for backward compatibility
  const loading = topicLoading || (storiesLoading && allContent.length === 0);
  
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const autoRetryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);
  
  // Cache state
  const [usingCachedContent, setUsingCachedContent] = useState(false);
  const hasSetupRealtimeRef = useRef(false);
  
  // Keyword filtering state
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isServerFiltering, setIsServerFiltering] = useState(false);
  const [availableKeywords, setAvailableKeywords] = useState<KeywordCount[]>([]);
  
  // Landmark filtering state
  const [selectedLandmarks, setSelectedLandmarks] = useState<string[]>([]);
  const [availableLandmarks, setAvailableLandmarks] = useState<KeywordCount[]>([]);
  
  // Organization filtering state
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  const [availableOrganizations, setAvailableOrganizations] = useState<KeywordCount[]>([]);
  
  // Source filtering state
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [availableSources, setAvailableSources] = useState<SourceCount[]>([]);
  
  // Refs for debouncing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serverFilteredRef = useRef(false);
  const filterIndexLoadingRef = useRef(false);
  const domainNameCacheRef = useRef<Record<string, string>>({});
  const refreshIndexDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const allContentRef = useRef<FeedContent[]>([]);
  const isServerFilteringRef = useRef(false);
  const [filterStoryIndex, setFilterStoryIndex] = useState<FilterStoryIndexEntry[]>([]);
  
  // Filter version tracking to prevent stale server responses from overwriting active filters
  const filterVersionRef = useRef(0);
  
  // Filter index loading state with safeguards
  const [filterIndexLoading, setFilterIndexLoading] = useState(false);
  const [filterIndexError, setFilterIndexError] = useState<string | null>(null);
  const [filterIndexTimedOut, setFilterIndexTimedOut] = useState(false);
  const filterIndexTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  // Derived filtered stories for backward compatibility
  const filteredStories = filteredContent.filter(item => item.type === 'story').map(item => item.data as Story);

  useEffect(() => {
    isServerFilteringRef.current = isServerFiltering;
  }, [isServerFiltering]);

  // Normalize MP names by removing honorifics and titles
  const normalizeMPName = useCallback((name: string | null | undefined) => {
    if (!name) return '';
    return name
      .replace(/^rt\.?\s+hon\.?\s+/i, '')
      .replace(/\b(mp|msp|ms)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const fetchAvailableParliamentaryFilters = useCallback(async (topicId: string) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
      .from('parliamentary_mentions')
      .select('mp_name, party, constituency, story_id')
      .eq('topic_id', topicId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching parliamentary filters:', error);
      return [];
    }

    // Group by MP and count votes
    const mpCounts = new Map<string, { 
      mp_name: string; 
      mp_party: string; 
      constituency: string; 
      count: number 
    }>();

    data?.forEach(record => {
      const normalizedName = normalizeMPName(record.mp_name);
      const key = normalizedName;
      if (mpCounts.has(key)) {
        mpCounts.get(key)!.count++;
      } else {
        mpCounts.set(key, {
          mp_name: normalizedName,
          mp_party: record.party || 'Unknown',
          constituency: record.constituency || 'Unknown',
          count: 1
        });
      }
    });

    return Array.from(mpCounts.values())
      .sort((a, b) => b.count - a.count);
  }, [normalizeMPName]);

  const loadTopic = useCallback(async () => {
    try {
      console.log('🔍 loadTopic: Starting optimized topic load for slug:', slug);
      
      // Combined query: Fetch both public topic data and full topic data in parallel
      const [publicTopicsResult, fullTopicResult] = await Promise.all([
        supabase
          .from('safe_public_topics')
          .select('id, name, description, topic_type, region, slug, is_public, is_active, created_at'),
        supabase
          .from('topics')
          .select('keywords, landmarks, organizations, branding_config, donation_enabled, donation_config, automated_insights_enabled')
          .ilike('slug', slug)
          .eq('is_public', true)
          .single()
      ]);

      if (publicTopicsResult.error) throw publicTopicsResult.error;

      // Case-insensitive slug matching
      const topicData = publicTopicsResult.data?.find(t => t.slug?.toLowerCase() === slug.toLowerCase());
      console.log('🔍 loadTopic: Found topic data:', topicData);
      
      if (!topicData) throw new Error('Topic not found');

      // Extract full topic data (keywords, branding, etc.)
      const fullTopicData = fullTopicResult.data;
      const keywordError = fullTopicResult.error;
      
      let topicKeywords: string[] = [];
      let topicLandmarks: string[] = [];
      let topicOrganizations: string[] = [];
      let brandingConfig = {};
      let donationEnabled = false;
      let donationConfig: any = { button_text: "Support this feed", tiers: [] };
      let automatedInsightsEnabled = true;
      if (!keywordError && fullTopicData) {
        topicKeywords = Array.isArray(fullTopicData.keywords) ? fullTopicData.keywords : [];
        topicLandmarks = Array.isArray(fullTopicData.landmarks) ? fullTopicData.landmarks : [];
        topicOrganizations = Array.isArray(fullTopicData.organizations) ? fullTopicData.organizations : [];
        brandingConfig = fullTopicData.branding_config || {};
        donationEnabled = fullTopicData.donation_enabled || false;
        donationConfig = (fullTopicData.donation_config as any) || { button_text: "Support this feed", tiers: [] };
        automatedInsightsEnabled = fullTopicData.automated_insights_enabled ?? true;
      }

      const topicObject = {
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword',
        keywords: topicKeywords,
        landmarks: topicLandmarks,
        organizations: topicOrganizations,
        is_public: topicData.is_public,
        created_by: '',
        branding_config: brandingConfig as any,
        donation_enabled: donationEnabled,
        donation_config: donationConfig as any,
        automated_insights_enabled: automatedInsightsEnabled
      };

      console.log('🔍 loadTopic: Setting topic object:', topicObject);
      setTopic(topicObject);
      return topicObject;
    } catch (error) {
      console.error('❌ Error loading topic:', error);
      throw error;
    }
  }, [slug]);

  const loadStoriesFromPublicFeed = useCallback(
    async (
      topicData: Topic, 
      pageNum: number = 0, 
      append: boolean = false,
      options: { suppressFiltered?: boolean } = {}
    ): Promise<{ success: boolean; orderedContent: FeedContent[]; transformedStories: Story[] }> => {
      const topicSlug = topicData.slug || slug;
      if (!topicSlug) {
        throw new Error('Topic slug unavailable for legacy feed fallback');
      }

      try {
        const from = pageNum * STORIES_PER_PAGE;
        console.log('🛟 Fallback: Loading stories via get_public_topic_feed', {
          topicSlug,
          pageNum,
          from
        });

        const { data: storiesData, error } = await supabase.rpc('get_public_topic_feed', {
          topic_slug_param: topicSlug,
          p_limit: STORIES_PER_PAGE,
          p_offset: from,
          p_sort_by: 'newest'
        });

        if (error) {
          throw error;
        }

        if (!storiesData || storiesData.length === 0) {
          if (!append) {
            setAllStories([]);
            setAllContent([]);
            allContentRef.current = [];
            if (!options.suppressFiltered) {
              setFilteredContent([]);
            }
          }
          setHasMore(false);
          return { success: true, orderedContent: [], transformedStories: [] };
        }

        const uniqueStoriesMap = new Map<string, any>();
        storiesData.forEach((story: any) => {
          if (story?.id && !uniqueStoriesMap.has(story.id)) {
            uniqueStoriesMap.set(story.id, story);
          }
        });

        const deduplicatedStories = Array.from(uniqueStoriesMap.values());
        const storyIds = deduplicatedStories.map((story: any) => story.id).filter(Boolean);

        let slidesData: any[] = [];
        if (storyIds.length > 0) {
          const { data: slides, error: slidesError } = await supabase.rpc('get_public_slides_for_stories', {
            p_story_ids: storyIds
          });

          if (slidesError) {
            console.warn('⚠️ Fallback: Failed to load slides via RPC, attempting chunked direct query', slidesError);
            
            // Fetch slides in chunks to avoid timeout
            const chunkSize = 50;
            const allSlides: any[] = [];
            
            for (let i = 0; i < storyIds.length; i += chunkSize) {
              const chunk = storyIds.slice(i, i + chunkSize);
              const { data: chunkSlides, error: chunkError } = await supabase
                .from('slides')
                .select('id,story_id,slide_number,content,word_count')
                .in('story_id', chunk)
                .order('slide_number', { ascending: true });

              if (chunkError) {
                console.warn('⚠️ Failed to fetch slides chunk:', chunkError);
                continue;
              }

              if (chunkSlides) {
                allSlides.push(...chunkSlides);
              }
            }

            slidesData = allSlides;
          } else {
            slidesData = slides || [];
          }
        }

        // Enrich with parliamentary metadata from stories table
        let parliamentaryMetaMap = new Map<string, any>();
        if (storyIds.length > 0) {
          try {
            const { data: metaData, error: metaError } = await supabase
              .from('stories')
              .select('id, slug, is_parliamentary, mp_name, mp_party, constituency, tone, cover_illustration_url, animated_illustration_url')
              .in('id', storyIds);
            
            if (!metaError && metaData) {
              metaData.forEach((meta: any) => {
                parliamentaryMetaMap.set(meta.id, {
                  slug: meta.slug,
                  is_parliamentary: meta.is_parliamentary,
                  mp_name: meta.mp_name,
                  mp_party: meta.mp_party,
                  constituency: meta.constituency,
                  tone: meta.tone,
                  cover_illustration_url: meta.cover_illustration_url,
                  animated_illustration_url: meta.animated_illustration_url
                });
              });
              console.debug('🏛️ Fallback: Enriched', metaData.length, 'stories with parliamentary metadata');
            }
          } catch (error) {
            console.warn('⚠️ Fallback: Failed to enrich parliamentary metadata:', error);
          }
        }

        const transformedStories: Story[] = deduplicatedStories.map((story: any) => {
          const storySlides = (slidesData || [])
            .filter((slide: any) => slide.story_id === story.id)
            .map((slide: any) => ({
              id: slide.id,
              slide_number: slide.slide_number,
              content: slide.content,
              word_count: slide.word_count || 0
            }));

          const meta = parliamentaryMetaMap.get(story.id);
          const isParliamentary = meta?.is_parliamentary || false;

          return {
            id: story.id,
            slug: meta?.slug || story.slug,
            title: story.title,
            author: story.author || 'Unknown',
            publication_name: story.publication_name || '',
            created_at: story.created_at,
            updated_at: story.updated_at,
            cover_illustration_url: story.cover_illustration_url || meta?.cover_illustration_url,
            animated_illustration_url: story.animated_illustration_url || meta?.animated_illustration_url,
            cover_illustration_prompt: story.cover_illustration_prompt,
            slides: storySlides,
            is_parliamentary: isParliamentary,
            mp_name: meta?.mp_name,
            mp_names: meta?.mp_name ? [meta.mp_name] : [],
            mp_party: meta?.mp_party,
            constituency: meta?.constituency,
            tone: meta?.tone,
            article: {
              source_url: story.article_source_url || '#',
              published_at: story.article_published_at || story.created_at,
              region: topicData.region || 'Unknown'
            }
          };
        });

        const parliamentaryCount = transformedStories.filter(s => s.is_parliamentary).length;
        if (parliamentaryCount > 0) {
          console.debug(`🏛️ Fallback: ${parliamentaryCount}/${transformedStories.length} stories marked as parliamentary`);
        }

        const storyContent: FeedContent[] = transformedStories.map(story => ({
          type: 'story' as const,
          id: story.id,
          content_date: story.created_at, // "new to me" ordering (stable, based on story creation)
          data: story
        }));

        // Parliamentary mentions are now handled via ParliamentaryInsightCard (non-chronological)
        // No longer merged into chronological feed

        const orderedContent = storyContent
          .filter(item => !!item?.id)
          .sort((a, b) => {
          const aTime = new Date(a.content_date).getTime();
          const bTime = new Date(b.content_date).getTime();
          return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
        });

        if (append) {
          setAllStories(prev => {
            const combined = [...prev, ...transformedStories];
            const map = new Map<string, Story>();
            combined.forEach(item => {
              if (!map.has(item.id)) {
                map.set(item.id, item);
              }
            });
            return Array.from(map.values());
          });

          setAllContent(prev => {
            const map = new Map<string, FeedContent>();
            [...prev, ...storyContent].forEach(item => {
              if (!map.has(item.id)) {
                map.set(item.id, item);
              }
            });
            const merged = Array.from(map.values()).sort((a, b) => {
              const aTime = new Date(a.content_date).getTime();
              const bTime = new Date(b.content_date).getTime();
              return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
            });
            allContentRef.current = merged;
            return merged;
          });

          setFilteredContent(prev => {
            const map = new Map<string, FeedContent>();
            [...prev, ...storyContent].forEach(item => {
              if (!map.has(item.id)) {
                map.set(item.id, item);
              }
            });
            return Array.from(map.values()).sort((a, b) => {
              const aTime = new Date(a.content_date).getTime();
              const bTime = new Date(b.content_date).getTime();
              return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
            });
          });
        } else {
          setAllStories(transformedStories);
          setAllContent(orderedContent);
          allContentRef.current = orderedContent;
          if (!options.suppressFiltered) {
            setFilteredContent(orderedContent);
          }
        }

        setHasMore(deduplicatedStories.length === STORIES_PER_PAGE);
        return { success: true, orderedContent, transformedStories };
      } catch (error) {
        console.error('❌ Legacy public feed fallback failed:', error);
        return { success: false, orderedContent: [], transformedStories: [] };
      }
    },
    [slug]
  );

  const loadStories = useCallback(async (
    topicData: any,
    pageNum: number = 0,
    append: boolean = false,
    keywords: string[] | null = null,
    sources: string[] | null = null
  ) => {
    try {
      if (pageNum === 0) {
        if (isServerFilteringRef.current) {
          setLoadingMore(true);
          setIsRefreshing(true);
        } else {
          setStoriesLoading(true);
        }
      } else {
        setLoadingMore(true);
      }

      // Use a larger raw rows limit - increase when filters active to improve matching
      // Increased multipliers to reduce offset pagination issues at scale
      const rawLimit = (keywords || sources) ? STORIES_PER_PAGE * 20 : STORIES_PER_PAGE * 10;
      const from = pageNum * rawLimit;
      
      console.log('🔍 Phase 2: Loading stories with filters', { 
        topicId: topicData.id, 
        page: pageNum, 
        keywords: keywords?.length || 0,
        sources: sources?.length || 0,
        rawLimit,
        from
      });

      // PHASE 2: Circuit breaker with device-aware timeout
      // Uses centralized detection from deviceUtils for consistent in-app browser handling
      const timeoutMs = getContextAwareTimeout();
      const browserType = isGmailWebView() ? 'Gmail' : isInAppBrowser() ? 'in-app' : 'standard';
      
      console.log(`⏱️ Using ${timeoutMs/1000}s timeout for ${browserType} browser`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`⚠️ Phase 2: RPC timeout after ${timeoutMs/1000} seconds (${browserType}), aborting...`);
        controller.abort();
      }, timeoutMs);

      let storiesData: any[] | null = null;
      let rpcError: any = null;
      const currentAllContent = allContentRef.current;

      try {
        const { data, error } = await supabase
          .rpc('get_topic_stories_with_keywords', {
            p_topic_id: topicData.id,
            p_keyword_filters: keywords,
            p_source_filters: sources,
            p_limit: rawLimit,
            p_offset: from
          } as any)
          .abortSignal(controller.signal);

        clearTimeout(timeoutId);
        storiesData = data;
        rpcError = error;
        
        // Log filtering info for debugging
        if (keywords || sources) {
          console.log('🔍 Filtering active:', {
            keywords: keywords?.length || 0,
            sources: sources?.length || 0,
            rowsReturned: data?.length || 0
          });
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.warn('⚠️ Phase 2: RPC aborted due to timeout');
          rpcError = new Error('Connection slow - using cached content');
        } else {
          rpcError = err;
        }
      }

      // PHASE 2: If RPC failed, fall back to multiple strategies
      if (rpcError) {
        console.error('🚨 Phase 2: RPC failed, falling back strategies triggered:', rpcError);

        // Strategy 1: Unfiltered load → use legacy feed
        if (!keywords && !sources) {
          try {
            const result = await loadStoriesFromPublicFeed(topicData, pageNum, append);
            if (result.success) {
              console.log('🛟 Phase 2: Legacy public feed fallback succeeded');
              return;
            }
          } catch (fallbackError) {
            console.error('❌ Phase 2: Legacy fallback failed:', fallbackError);
          }
        }

        // Strategy 2: Client-side filtering on existing content
        if (!append && currentAllContent.length > 0) {
          console.log('🔄 Phase 2: Using client-side filtering on existing content');
        const filtered = applyClientSideFiltering(
          currentAllContent,
          keywords || [],
          sources || []
        );
          setFilteredContent(filtered);
          setHasMore(false);
          return;
        }

        // Strategy 3: Filtered cold start → fetch unfiltered, then filter
        if ((keywords || sources) && currentAllContent.length === 0) {
          try {
            console.log('🔄 Phase 2: Filtered cold start - fetching base content for client-side filtering');
            const result = await loadStoriesFromPublicFeed(topicData, pageNum, false, { suppressFiltered: true });

            // Apply client-side filter synchronously using the returned content
            const base = result.orderedContent.length > 0 ? result.orderedContent : currentAllContent;
            const filtered = applyClientSideFiltering(base, keywords || [], sources || []);
            setFilteredContent(filtered);
            setHasMore(false);
            console.log('🛟 Phase 2: Filtered fallback succeeded with', filtered.length, 'items');
            return;
          } catch (fallbackError) {
            console.error('❌ Phase 2: Filtered fallback failed:', fallbackError);
          }
        }

        // Strategy 4: All fallbacks failed → show error
        throw rpcError;
      }

      if (!storiesData || storiesData.length === 0) {
        console.log('📄 Phase 2: No stories found');
        if (!append) {
          setAllStories([]);
          setAllContent([]);
          allContentRef.current = [];
          setFilteredContent([]);
        }
        setHasMore(false);
        return;
      }

      // Group RPC results by story_id since it returns one row per slide
      console.log('🔍 [GROUPING] Starting story grouping from', storiesData.length, 'rows');
      const storyMap = new Map();
      const storySlideCountMap = new Map(); // Track how many slides we got per story
      
      storiesData.forEach((row: any) => {
        if (!storyMap.has(row.story_id)) {
          storyMap.set(row.story_id, {
            id: row.story_id,
            title: row.story_title,
            status: 'published', // Fixed RPC only returns published stories
            is_published: true, // Fixed RPC only returns published stories
            created_at: row.story_created_at,
            cover_illustration_url: row.story_cover_illustration_url || row.story_cover_url,
            article_source_url: row.article_source_url,
            article_published_at: row.article_published_at,
            article_id: row.article_id,
            shared_content_id: row.shared_content_id,
            is_parliamentary: row.is_parliamentary || row.story_is_parliamentary || false,
            mp_name: row.mp_name || undefined,
            mp_party: row.mp_party || undefined,
            constituency: row.constituency || undefined,
            tone: row.story_tone || undefined,
            mp_names: new Set<string>(), // aggregate MPs across rows
            slides: [],
            slideIds: new Set() // Track slide IDs to prevent duplicates
          });
          storySlideCountMap.set(row.story_id, 0);
          console.log('🔍 [GROUPING] New story detected:', {
            id: row.story_id.substring(0, 8),
            title: row.story_title?.substring(0, 50)
          });
        }
        
        // Add slide if it exists and hasn't been added yet
        if (row.slide_id) {
          const storyData = storyMap.get(row.story_id);

          // Aggregate MP names from RPC into Set
          if (Array.isArray(row.mp_names)) {
            row.mp_names.forEach((n: string) => {
              if (n) storyData.mp_names?.add(n);
            });
          } else if (row.mp_name) {
            storyData.mp_names?.add(row.mp_name);
          }
          
          // Keep first mp_name for backwards compatibility
          if (!storyData.mp_name && row.mp_name) {
            storyData.mp_name = row.mp_name;
          }

          if (!storyData.slideIds.has(row.slide_id)) {
            storyData.slideIds.add(row.slide_id);
            storyData.slides.push({
              id: row.slide_id,
              slide_number: row.slide_number,
              content: row.slide_content,
              word_count: 0
            });
            // Defensive sort immediately after adding
            storyData.slides.sort((a: any, b: any) => a.slide_number - b.slide_number);
            storySlideCountMap.set(row.story_id, storySlideCountMap.get(row.story_id) + 1);
          } else {
            console.warn(`⚠️ Duplicate slide prevented: ${row.slide_id.substring(0, 8)} in story ${row.story_id.substring(0, 8)}`);
          }
        }
      });
      
      // Defensive split detection: warn if any story starts at slide > 1 (indicates split across pages)
      storyMap.forEach((storyData, storyId) => {
        const minSlide = Math.min(...storyData.slides.map((s: any) => s.slide_number));
        if (minSlide > 1) {
          console.warn(`⚠️ SPLIT DETECTED: Story ${storyId.substring(0, 8)} starts at slide ${minSlide} - story was split across pages!`);
        }
      });
      
      console.log('🔍 [GROUPING] Grouped into', storyMap.size, 'unique stories');
      
      // CONDITIONAL OPTIMIZATION: Only re-fetch slides for stories with incomplete slide data (<3 slides)
      // This preserves the safety net for incomplete stories while eliminating ~90% of redundant requests
      const storyIds = Array.from(storyMap.keys());
      const incompleteStoryIds = storyIds.filter(storyId => {
        const storyData = storyMap.get(storyId);
        return storyData && storyData.slides.length < 3;
      });
      
      if (incompleteStoryIds.length > 0) {
        console.log(`🔄 Re-fetching slides for ${incompleteStoryIds.length}/${storyIds.length} stories with incomplete data`);
        const chunkSize = 50;
        const slideMap = new Map<string, any[]>();
        for (let i = 0; i < incompleteStoryIds.length; i += chunkSize) {
          const chunk = incompleteStoryIds.slice(i, i + chunkSize);
          const { data: slidesData, error: slidesError } = await supabase
            .from('slides')
            .select('id,story_id,slide_number,content')
            .in('story_id', chunk)
            .order('slide_number', { ascending: true });
          if (slidesError) {
            console.warn('⚠️ Failed to fetch full slides for stories chunk:', slidesError);
            continue;
          }
          (slidesData || []).forEach((s: any) => {
            const arr = slideMap.get(s.story_id) || [];
            if (!arr.some((t: any) => t.id === s.id)) {
              arr.push({ id: s.id, slide_number: s.slide_number, content: s.content, word_count: 0 });
            }
            slideMap.set(s.story_id, arr);
          });
        }
        // Replace slides with the complete sets when available (only for incomplete stories)
        slideMap.forEach((slides, sid) => {
          const storyData = storyMap.get(sid);
          if (storyData) {
            storyData.slides = slides.sort((a: any, b: any) => a.slide_number - b.slide_number);
          }
        });
      } else {
        console.log(`✅ All ${storyIds.length} stories have complete slide data from RPC - skipping re-fetch`);
      }
      
      // Log slide counts to detect incomplete stories
      const slideCounts = Array.from(storySlideCountMap.entries()).map(([storyId, count]) => ({
        storyId: storyId.substring(0, 8),
        slideCount: count
      }));
      console.log('📊 Stories with slide counts:', slideCounts.slice(0, 5));
      
      // Warn if any story has very few slides (might indicate missing slides)
      slideCounts.forEach(({ storyId, slideCount }) => {
        if (slideCount < 3) {
          console.warn(`⚠️ Story ${storyId} has only ${slideCount} slide(s) - might be incomplete`);
        }
      });
      
      const uniqueStories = Array.from(storyMap.values());
      const pageUniqueStories = uniqueStories;

      // PARALLELIZED: Fetch popularity and parliamentary metadata concurrently
      const storyIdsForPopularity = Array.from(storyMap.keys());
      let popularityMap = new Map();
      let parliamentaryMetaMap = new Map<string, any>();
      
      if (storyIdsForPopularity.length > 0) {
        // Wrap in Promise.resolve to ensure .catch is available
        const popularityPromise = Promise.resolve(
          supabase.rpc('get_popular_stories_by_period', {
            p_topic_id: topicData.id
          })
        ).then(({ data, error }) => {
          if (error) {
            console.warn('⚠️ Failed to load popularity data:', error);
            return [];
          }
          return data || [];
        }).catch(error => {
          console.warn('⚠️ Failed to load popularity data:', error);
          return [] as any[];
        });
        
        const metaPromise = Promise.resolve(
          supabase
            .from('stories')
            .select('id, slug, is_parliamentary, mp_name, mp_party, constituency, tone, cover_illustration_url, animated_illustration_url')
            .in('id', storyIdsForPopularity)
        ).then(({ data, error }) => {
          if (error) {
            console.warn('⚠️ Primary RPC: Failed to enrich parliamentary metadata:', error);
            return [];
          }
          return data || [];
        }).catch(error => {
          console.warn('⚠️ Primary RPC: Failed to enrich parliamentary metadata:', error);
          return [] as any[];
        });
        
        const [popularityResult, metaResult] = await Promise.all([popularityPromise, metaPromise]);
        
        // Process popularity data
        popularityResult.forEach((item: any) => {
          popularityMap.set(item.story_id, {
            period_type: item.period_type,
            swipe_count: item.swipe_count,
            rank_position: item.rank_position
          });
        });
        
        // Process parliamentary metadata
        metaResult.forEach((meta: any) => {
          parliamentaryMetaMap.set(meta.id, {
            slug: meta.slug,
            is_parliamentary: meta.is_parliamentary,
            mp_name: meta.mp_name,
            mp_party: meta.mp_party,
            constituency: meta.constituency,
            tone: meta.tone,
            cover_illustration_url: meta.cover_illustration_url,
            animated_illustration_url: meta.animated_illustration_url
          });
        });
        
        console.debug('🚀 Parallelized enrichment: popularity +', metaResult.length, 'stories with metadata');
      }

      // Transform stories with slides data and popularity
      const transformedStories = pageUniqueStories.map((story: any) => {
        // Sort slides by slide_number and remove slideIds tracking property
        const sortedSlides = story.slides.sort((a: any, b: any) => a.slide_number - b.slide_number);
        
        // Validation: check for duplicate slide numbers
        const slideNumbers = sortedSlides.map((s: any) => s.slide_number);
        const uniqueSlideNumbers = new Set(slideNumbers);
        if (slideNumbers.length !== uniqueSlideNumbers.size) {
          console.warn(`⚠️ Story ${story.id.substring(0, 8)} has duplicate slide_numbers:`, slideNumbers);
        }
        
        // Validation: check if slides are sequential starting from 1
        const isSequential = slideNumbers.every((num, idx) => num === idx + 1);
        if (!isSequential) {
          console.error('🚨 Slide ordering bug detected!', {
            storyId: story.id.substring(0, 8),
            slideNumbers,
            expected: sortedSlides.map((_, idx) => idx + 1)
          });
        }
        
        // Validation: ensure first slide is slide_number 1
        if (sortedSlides.length > 0 && sortedSlides[0].slide_number !== 1) {
          console.error('🚨 First slide is not slide_number 1!', {
            storyId: story.id.substring(0, 8),
            firstSlideNumber: sortedSlides[0].slide_number,
            allSlideNumbers: slideNumbers
          });
        }
          
        // Backfill missing parliamentary data from stories table
        const meta = parliamentaryMetaMap.get(story.id);
        const isParliamentaryFromRPC = !!story.is_parliamentary;
        const mpNameFinal = story.mp_name || meta?.mp_name;
        const mpPartyFinal = story.mp_party || meta?.mp_party;
        const constituencyFinal = story.constituency || meta?.constituency;
        const toneFinal = story.tone || meta?.tone;
        
        // Only trust the explicit is_parliamentary field from the database
        const isParliamentaryFinal = isParliamentaryFromRPC || meta?.is_parliamentary || false;

        return {
          id: story.id,
          slug: meta?.slug || story.slug,
          title: story.title,
          author: 'Unknown',
          publication_name: '',
          created_at: story.created_at,
          updated_at: story.created_at,
          cover_illustration_url: story.cover_illustration_url || meta?.cover_illustration_url,
          animated_illustration_url: story.animated_illustration_url || meta?.animated_illustration_url,
          cover_illustration_prompt: '',
          popularity_data: popularityMap.get(story.id),
          slides: sortedSlides,
          is_parliamentary: isParliamentaryFinal,
          mp_name: mpNameFinal,
          mp_names: Array.from((story.mp_names || new Set<string>()) as Set<string>)
            .map(n => normalizeMPName(n))
            .filter((n): n is string => !!n),
          mp_party: mpPartyFinal,
          constituency: constituencyFinal,
          tone: toneFinal,
          article: {
            source_url: story.article_source_url || '#',
            published_at: story.article_published_at,
            region: topicData.region || 'Unknown'
          }
        };
      });

      const parliamentaryCount = transformedStories.filter(s => s.is_parliamentary).length;
      if (parliamentaryCount > 0) {
        console.debug(`🏛️ Primary RPC: ${parliamentaryCount}/${transformedStories.length} stories marked as parliamentary`);
      }

      // Parliamentary mentions are now handled via ParliamentaryInsightCard (non-chronological)
      // No longer merged into chronological feed

      const storyContent: FeedContent[] = transformedStories.map(story => ({
        type: 'story' as const,
        id: story.id,
        content_date: story.created_at, // "new to me" ordering (stable, based on story creation)
        data: story
      }));

      // Defensive deduplication: use Map to ensure each ID appears exactly once
      console.log('🔍 [DEDUP] Before dedup:', storyContent.length, 'stories');
      const contentMap = new Map<string, FeedContent>();
      storyContent.forEach(item => {
        if (item?.id) {
          if (!contentMap.has(item.id)) {
            contentMap.set(item.id, item);
          } else {
            const existing = contentMap.get(item.id);
            console.warn(`⚠️ [DEDUP] Duplicate content detected:`, {
              id: item.id.substring(0, 8),
              type: item.type,
              title: (item.data as any).title?.substring(0, 50),
              existingSlides: (existing?.data as any).slides?.length,
              newSlides: (item.data as any).slides?.length
            });
          }
        }
      });
      console.log('🔍 [DEDUP] After dedup:', contentMap.size, 'unique items');

      const now = new Date().getTime();
      const sortedContent = Array.from(contentMap.values())
        .filter(item => {
          // Filter out stories with future published dates
          const itemDate = new Date(item.content_date).getTime();
          if (isNaN(itemDate)) return true; // Keep items with invalid dates
          return itemDate <= now; // Only keep items with dates in the past or present
        })
        .sort((a, b) => {
          const dateA = new Date(a.content_date).getTime();
          const dateB = new Date(b.content_date).getTime();
          // If dates are invalid, fall back to treating as very old
          const validDateA = isNaN(dateA) ? 0 : dateA;
          const validDateB = isNaN(dateB) ? 0 : dateB;
          return validDateB - validDateA; // Newest first
        });

      console.log('🔍 Content ordering:', sortedContent.slice(0, 5).map(item => ({
        type: item.type,
        id: item.id.substring(0, 8),
        date: item.content_date,
        title: (item.data as any).title
      })));

      if (append) {
        console.log('🔍 [APPEND] Appending', transformedStories.length, 'new stories to existing content');
        setAllStories(prev => {
          const combined = [...prev, ...transformedStories];
          console.log('🔍 [APPEND] AllStories now has', combined.length, 'stories');
          return combined;
        });
        
        // Merge new stories with existing content and re-sort chronologically with deduplication
        setAllContent(prev => {
          console.log('🔍 [APPEND] Merging into allContent, prev had', prev.length, 'items');
          const contentMap = new Map<string, FeedContent>();
          [...prev, ...storyContent].forEach(item => {
            if (!contentMap.has(item.id)) {
              contentMap.set(item.id, item);
            } else {
              console.warn('🔍 [APPEND] Skipping duplicate in allContent:', item.id.substring(0, 8));
            }
          });
          const sorted = Array.from(contentMap.values()).sort((a, b) => {
            const aTime = new Date(a.content_date).getTime();
            const bTime = new Date(b.content_date).getTime();
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          });
          console.log('🔍 [APPEND] AllContent now has', sorted.length, 'items');
          allContentRef.current = sorted;
          return sorted;
        });

        setFilteredContent(prev => {
          console.log('🔍 [APPEND] Merging into filteredContent, prev had', prev.length, 'items');
          const contentMap = new Map<string, FeedContent>();
          const base = prev;
          [...base, ...storyContent].forEach(item => {
            if (!contentMap.has(item.id)) {
              contentMap.set(item.id, item);
            } else {
              console.warn('🔍 [APPEND] Skipping duplicate in filteredContent:', item.id.substring(0, 8));
            }
          });

          const sorted = Array.from(contentMap.values()).sort((a, b) => {
            const aTime = new Date(a.content_date).getTime();
            const bTime = new Date(b.content_date).getTime();
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          });

          console.log('🔍 [APPEND] FilteredContent now has', sorted.length, 'items');
          return sorted;
        });
      } else {
        console.log('🔍 [INITIAL] Setting initial content:', transformedStories.length, 'stories', sortedContent.length, 'sorted items');
        setAllStories(transformedStories);
        // For initial load, use the sorted content with proper chronological order
        setAllContent(sortedContent);
        allContentRef.current = sortedContent;
        
        // Check if user has active filters - don't overwrite their filtered view with unfiltered data
        const hasActiveFilters = selectedKeywords.length > 0 || 
          selectedLandmarks.length > 0 || 
          selectedOrganizations.length > 0 || 
          selectedSources.length > 0;
        
        if (!keywords && !sources) {
          // This is an unfiltered background refresh
          if (hasActiveFilters) {
            // Re-apply active filters to the new base content instead of overwriting
            // Inline the filtering logic since applyClientSideFiltering isn't defined yet
            const combined = [...selectedKeywords, ...selectedLandmarks, ...selectedOrganizations];
            const refiltered = sortedContent.filter(item => {
              if (item.type === 'story') {
                const story = item.data as Story;
                
                // Check keyword filter (OR logic)
                const keywordMatch = combined.length === 0 || (() => {
                  const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
                  return combined.some(keyword => {
                    const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
                    return wordBoundaryRegex.test(text);
                  });
                })();
                
                // Check source filter
                const sourceMatch = selectedSources.length === 0 || (() => {
                  if (!story.article?.source_url) return false;
                  try {
                    const url = new URL(story.article.source_url);
                    const domain = url.hostname.replace(/^www\./, '');
                    return selectedSources.includes(domain);
                  } catch (e) {
                    return false;
                  }
                })();
                
                return keywordMatch && sourceMatch;
              }
              return false;
            }).sort((a, b) => new Date(b.content_date).getTime() - new Date(a.content_date).getTime());
            
            setFilteredContent(refiltered);
            console.log('🔍 [INITIAL] Re-applied active filters to refreshed content:', refiltered.length, 'items');
          } else {
            setFilteredContent(sortedContent);
            console.log('🔍 [INITIAL] FilteredContent set to', sortedContent.length, 'items (no filters)');
          }
        } else {
          // For filtering, only include stories for now
          setFilteredContent(storyContent);
          serverFilteredRef.current = true;
          console.log('🔍 [INITIAL] FilteredContent set to', storyContent.length, 'stories (with filters)');
        }
        
        // Log the first few stories for debugging
        console.log('🔍 [INITIAL] First 3 stories:', transformedStories.slice(0, 3).map(s => ({
          id: s.id.substring(0, 8),
          title: s.title?.substring(0, 50),
          slides: s.slides.length,
          published_at: s.article.published_at
        })));
      }
      
      // Determine if there might be more data based on unique story count
      // Use pageUniqueStories.length for reliable pagination regardless of filters or content type
      setHasMore(pageUniqueStories.length >= STORIES_PER_PAGE);
      
    } catch (error) {
      console.error('❌ Error loading stories:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        slug,
        page,
        filtersApplied: {
          keywords: selectedKeywords?.length || 0,
          landmarks: selectedLandmarks?.length || 0,
          organizations: selectedOrganizations?.length || 0,
          sources: selectedSources?.length || 0
        }
      });
      
      // Don't show destructive toast for timeout fallbacks - they're handled gracefully
      const errorMessage = error instanceof Error ? error.message : "Failed to load stories";
      const isTimeoutFallback = errorMessage.includes('cached content');
      
      // Track error for mobile retry UI
      if (!isTimeoutFallback) {
        setLoadError(errorMessage);
        setRetryCount(prev => prev + 1);
        
        toast({
          title: "Error Loading Stories",
          description: `${errorMessage}. Please refresh the page.`,
          variant: "destructive"
        });
      }
    } finally {
      setStoriesLoading(false);
      setIsRefreshing(false);
      setLoadingMore(false);
      setIsServerFiltering(false);
      isServerFilteringRef.current = false;
    }
  }, [slug, loadStoriesFromPublicFeed, normalizeMPName, selectedKeywords, selectedLandmarks, selectedOrganizations, selectedSources]);

  const extractDomain = useCallback((url?: string | null) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch (error) {
      return null;
    }
  }, []);

  const formatSourceName = useCallback((domain: string) => {
    if (!domain || domain === 'unknown') {
      return 'Unknown';
    }

    const cleaned = domain.replace(/^www\./, '');
    const base = cleaned.split('.')[0];
    if (!base) return cleaned;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }, []);

  const resolveSourceNames = useCallback(async (domains: string[]) => {
    const unresolved = domains.filter(domain => !!domain && !domainNameCacheRef.current[domain]);
    if (unresolved.length === 0) return;

    const { data, error } = await supabase
      .from('content_sources')
      .select('canonical_domain, source_name')
      .in('canonical_domain', unresolved);

    if (error) {
      console.warn('⚠️ Failed to resolve source names:', error);
      unresolved.forEach(domain => {
        if (!domainNameCacheRef.current[domain]) {
          domainNameCacheRef.current[domain] = formatSourceName(domain);
        }
      });
      return;
    }

    (data || []).forEach(row => {
      if (row.canonical_domain) {
        domainNameCacheRef.current[row.canonical_domain] = row.source_name || formatSourceName(row.canonical_domain);
      }
    });
  }, [formatSourceName]);

  const loadFilterStoryIndex = useCallback(async (topicData: Topic | null, forceReload: boolean = false) => {
    if (!topicData?.id) return;
    
    // Skip if already loading, unless force reload requested
    if (filterIndexLoadingRef.current && !forceReload) return;

    filterIndexLoadingRef.current = true;
    setFilterIndexLoading(true);
    setFilterIndexError(null);
    setFilterIndexTimedOut(false);
    
    // Set 8-second timeout fallback to prevent permanently disabled button
    if (filterIndexTimeoutRef.current) {
      clearTimeout(filterIndexTimeoutRef.current);
    }
    filterIndexTimeoutRef.current = setTimeout(() => {
      if (filterIndexLoadingRef.current) {
        console.warn('⏱️ Filter index loading timed out after 8s, enabling button anyway');
        setFilterIndexTimedOut(true);
        setFilterIndexLoading(false);
        filterIndexLoadingRef.current = false;
      }
    }, 8000);
    
    console.log('🔍 [FILTER INDEX] Starting load for topic:', {
      topicId: topicData.id,
      topicSlug: topicData.slug,
      topicName: topicData.name,
      forceReload,
      timestamp: new Date().toISOString()
    });

    try {
      const normalizeTerm = (term: unknown): string | null => {
        if (term == null) return null;
        const s = String(term)
          .replace(/\s+/g, ' ')
          .trim();
        if (!s) return null;
        return s.toLowerCase();
      };

      const keywords = topicData.keywords || [];
      const landmarks = topicData.landmarks || [];
      const organizations = topicData.organizations || [];

      const allTerms = [...keywords, ...landmarks, ...organizations];
      // Normalize + de-dupe to avoid silent mismatches from whitespace/case variations
      const keywordsLower = Array.from(
        new Set(allTerms.map(normalizeTerm).filter(Boolean) as string[])
      );

      console.log('📋 Tracking terms:', {
        keywords: keywords.length,
        landmarks: landmarks.length,
        organizations: organizations.length,
        normalizedTracked: keywordsLower.length,
      });

      const limit = 400;
      let offset = 0;
      const slugToUse = (topicData.slug || slug || '').toLowerCase();
      if (!slugToUse) {
        setFilterStoryIndex([]);
        return;
      }
      const storyMap = new Map<string, { title: string; sourceUrl: string | null; slideContents: Set<string> }>();

      while (true) {
        const { data, error } = await supabase.rpc('get_topic_stories_with_keywords', {
          p_topic_id: topicData.id,
          p_keyword_filters: null,
          p_source_filters: null,
          p_limit: limit,
          p_offset: offset
        } as any);

        let rows = data || [];
        let usedFallback = false;

        // Trigger fallback if RPC fails OR if first page returns empty (which suggests RPC issue)
        const shouldUseFallback = error || (offset === 0 && rows.length === 0);

        if (shouldUseFallback) {
          if (error) {
            console.error('❌ Failed to load filter index batch:', {
              error,
              message: error.message,
              details: error.details,
              hint: error.hint,
              params: { p_topic_id: topicData.id, offset, limit }
            });
            console.error('❌ RPC failed, attempting direct query fallback');
          } else {
            console.warn('⚠️ RPC returned empty first page, using direct query fallback');
          }

          const { data: fallbackData, error: fallbackError } = await supabase
            .from('stories')
            .select(`
              id,
              title,
              is_published,
              article:articles ( source_url, canonical_url, original_url ),
              topic_article:topic_articles!inner ( topic_id ),
              slides ( content )
            `)
            .eq('topic_article.topic_id', topicData.id)
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (fallbackError) {
            console.error('❌ Fallback query also failed:', fallbackError);
            break;
          }

          usedFallback = true;
          rows = (fallbackData || []).flatMap((story: any) => {
            const slides = story?.slides || [];
            const sourceUrl = story?.article?.source_url || story?.article?.canonical_url || story?.article?.original_url || null;
            if (!slides || slides.length === 0) {
              return [{
                story_id: story?.id,
                story_title: story?.title,
                article_source_url: sourceUrl,
                slide_content: ''
              }];
            }

            return slides.map((slide: any) => ({
              story_id: story?.id,
              story_title: story?.title,
              article_source_url: sourceUrl,
              slide_content: slide?.content || ''
            }));
          });
        }

        console.log(usedFallback ? '📊 Loaded fallback batch:' : '📊 Loaded batch:', { offset, rowCount: rows.length, limit });
        rows.forEach((row: any) => {
          if (!row?.story_id) return;
          const existing = storyMap.get(row.story_id) || {
            title: row.story_title || '',
            sourceUrl: row.article_source_url || null,
            slideContents: new Set<string>()
          };

          if (row.story_title && !existing.title) {
            existing.title = row.story_title;
          }

          if (row.article_source_url && !existing.sourceUrl) {
            existing.sourceUrl = row.article_source_url;
          }

          if (row.slide_content) {
            existing.slideContents.add(row.slide_content);
          }

          storyMap.set(row.story_id, existing);
        });

        if (rows.length < limit) {
          break;
        }

        offset += limit;
      }

      const indexEntries: FilterStoryIndexEntry[] = [];

      storyMap.forEach((value, key) => {
        const combinedText = `${value.title || ''} ${Array.from(value.slideContents).join(' ')}`.toLowerCase();
        const matches = new Set<string>();

        if (keywordsLower.length > 0) {
          keywordsLower.forEach(keyword => {
            if (keyword) {
              const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              // Use non-word boundaries so phrases and punctuation still match reliably
              const wordBoundaryRegex = new RegExp(`(?:^|\\W)${escapedKeyword}(?:$|\\W)`, 'i');
              if (wordBoundaryRegex.test(combinedText)) {
                matches.add(keyword);
              }
            }
          });
        }

        indexEntries.push({
          id: key,
          sourceDomain: extractDomain(value.sourceUrl),
          keywordMatches: Array.from(matches)
        });
      });

      console.log('✅ Filter index built:', {
        totalStories: storyMap.size,
        indexEntries: indexEntries.length,
        keywordsTracked: keywordsLower.length,
        sampleEntry: indexEntries[0],
        topicId: topicData.id
      });

      setFilterStoryIndex(indexEntries);
      
      // Clear timeout on success
      if (filterIndexTimeoutRef.current) {
        clearTimeout(filterIndexTimeoutRef.current);
      }
    } catch (error) {
      console.warn('⚠️ Failed to build filter story index:', error);
      setFilterIndexError(error instanceof Error ? error.message : 'Failed to load filters');
      
      // Clear timeout on error
      if (filterIndexTimeoutRef.current) {
        clearTimeout(filterIndexTimeoutRef.current);
      }
    } finally {
      filterIndexLoadingRef.current = false;
      setFilterIndexLoading(false);
    }
  }, [extractDomain, slug]);

  const ensureFilterStoryIndexLoaded = useCallback(() => {
    if (!topic || filterIndexLoadingRef.current) return;

    if (filterStoryIndex.length === 0) {
      loadFilterStoryIndex(topic);
    }
  }, [topic, filterStoryIndex.length, loadFilterStoryIndex]);

  const computeFilterOptionsFromIndex = useCallback(async (
    index: FilterStoryIndexEntry[],
    topicKeywords: string[],
    topicLandmarks: string[],
    topicOrganizations: string[],
    activeKeywords: string[],
    activeLandmarks: string[],
    activeOrganizations: string[],
    activeSources: string[]
  ) => {
    // If index is empty, return topic keywords/landmarks/organizations with count=0
    if (index.length === 0 && activeKeywords.length === 0 && activeLandmarks.length === 0 && activeOrganizations.length === 0 && activeSources.length === 0) {
      const keywordResults = (topicKeywords || []).map(k => ({ keyword: k, count: 0 }));
      const landmarkResults = (topicLandmarks || []).map(l => ({ keyword: l, count: 0 }));
      const organizationResults = (topicOrganizations || []).map(o => ({ keyword: o, count: 0 }));
      console.log('📋 Showing topic keywords with zero counts:', {
        keywords: keywordResults.length,
        landmarks: landmarkResults.length,
        organizations: organizationResults.length
      });
      return { 
        keywords: keywordResults, 
        landmarks: landmarkResults, 
        organizations: organizationResults, 
        sources: [] as SourceCount[] 
      };
    }

    const keywordLookup = new Map<string, string>();
    const landmarkLookup = new Map<string, string>();
    const organizationLookup = new Map<string, string>();
    
    const topicKeywordsLower = (topicKeywords || []).map(k => k.toLowerCase());
    const topicLandmarksLower = (topicLandmarks || []).map(l => l.toLowerCase());
    const topicOrganizationsLower = (topicOrganizations || []).map(o => o.toLowerCase());
    
    topicKeywordsLower.forEach((keyword, idx) => {
      keywordLookup.set(keyword, topicKeywords[idx]);
    });
    topicLandmarksLower.forEach((landmark, idx) => {
      landmarkLookup.set(landmark, topicLandmarks[idx]);
    });
    topicOrganizationsLower.forEach((org, idx) => {
      organizationLookup.set(org, topicOrganizations[idx]);
    });

    const activeKeywordSet = new Set(activeKeywords.map(k => k.toLowerCase()));
    const activeLandmarkSet = new Set(activeLandmarks.map(l => l.toLowerCase()));
    const activeOrganizationSet = new Set(activeOrganizations.map(o => o.toLowerCase()));
    const activeSourceSet = new Set(activeSources);

    // Use OR logic (.some) for multi-select: show stories matching ANY selected keyword/landmark/org
    const matchingStories = index.filter(story => {
      const matchesKeywords = activeKeywordSet.size === 0 || Array.from(activeKeywordSet).some(keyword => story.keywordMatches.includes(keyword));
      const matchesLandmarks = activeLandmarkSet.size === 0 || Array.from(activeLandmarkSet).some(landmark => story.keywordMatches.includes(landmark));
      const matchesOrganizations = activeOrganizationSet.size === 0 || Array.from(activeOrganizationSet).some(org => story.keywordMatches.includes(org));
      const matchesSources = activeSourceSet.size === 0 || (story.sourceDomain && activeSourceSet.has(story.sourceDomain));
      return matchesKeywords && matchesLandmarks && matchesOrganizations && matchesSources;
    });

    const keywordCounts = new Map<string, number>();
    const landmarkCounts = new Map<string, number>();
    const organizationCounts = new Map<string, number>();
    
    topicKeywordsLower.forEach(keyword => {
      keywordCounts.set(keyword, 0);
    });
    topicLandmarksLower.forEach(landmark => {
      landmarkCounts.set(landmark, 0);
    });
    topicOrganizationsLower.forEach(org => {
      organizationCounts.set(org, 0);
    });

    matchingStories.forEach(story => {
      story.keywordMatches.forEach(match => {
        // Prioritize: landmarks > organizations > keywords
        // Only count in the highest priority category to avoid duplicates
        if (landmarkCounts.has(match)) {
          landmarkCounts.set(match, (landmarkCounts.get(match) || 0) + 1);
        } else if (organizationCounts.has(match)) {
          organizationCounts.set(match, (organizationCounts.get(match) || 0) + 1);
        } else if (keywordCounts.has(match)) {
          keywordCounts.set(match, (keywordCounts.get(match) || 0) + 1);
        }
      });
    });

    activeKeywordSet.forEach(keyword => {
      if (!keywordCounts.has(keyword)) {
        keywordCounts.set(keyword, 0);
      }
    });
    activeLandmarkSet.forEach(landmark => {
      if (!landmarkCounts.has(landmark)) {
        landmarkCounts.set(landmark, 0);
      }
    });
    activeOrganizationSet.forEach(org => {
      if (!organizationCounts.has(org)) {
        organizationCounts.set(org, 0);
      }
    });

    // Always show all topic keywords, even with count=0, when no keyword filters are active
    const noActiveKeywordFilters = activeKeywordSet.size === 0;
    
    const keywordResults: KeywordCount[] = Array.from(keywordCounts.entries())
      .filter(([keyword, count]) => count > 0 || activeKeywordSet.has(keyword) || noActiveKeywordFilters)
      .map(([keyword, count]) => ({
        keyword: keywordLookup.get(keyword) || keyword,
        count
      }))
      .sort((a, b) => {
        if (b.count === a.count) {
          return a.keyword.localeCompare(b.keyword);
        }
        return b.count - a.count;
      });

    // Always show all topic landmarks when no landmark filters are active
    const noActiveLandmarkFilters = activeLandmarkSet.size === 0;
    
    const landmarkResults: KeywordCount[] = Array.from(landmarkCounts.entries())
      .filter(([landmark, count]) => count > 0 || activeLandmarkSet.has(landmark) || noActiveLandmarkFilters)
      .map(([landmark, count]) => ({
        keyword: landmarkLookup.get(landmark) || landmark,
        count
      }))
      .sort((a, b) => {
        if (b.count === a.count) {
          return a.keyword.localeCompare(b.keyword);
        }
        return b.count - a.count;
      });

    // Always show all topic organizations when no organization filters are active
    const noActiveOrganizationFilters = activeOrganizationSet.size === 0;

    const organizationResults: KeywordCount[] = Array.from(organizationCounts.entries())
      .filter(([org, count]) => count > 0 || activeOrganizationSet.has(org) || noActiveOrganizationFilters)
      .map(([org, count]) => ({
        keyword: organizationLookup.get(org) || org,
        count
      }))
      .sort((a, b) => {
        if (b.count === a.count) {
          return a.keyword.localeCompare(b.keyword);
        }
        return b.count - a.count;
      });

    const sourceCounts = new Map<string, number>();
    matchingStories.forEach(story => {
      const domain = story.sourceDomain || 'unknown';
      sourceCounts.set(domain, (sourceCounts.get(domain) || 0) + 1);
    });

    activeSourceSet.forEach(domain => {
      if (!sourceCounts.has(domain)) {
        sourceCounts.set(domain, 0);
      }
    });

    const domains = Array.from(sourceCounts.keys()).filter(Boolean);
    await resolveSourceNames(domains);

    const sourceResults: SourceCount[] = domains
      .map(domain => {
        const resolvedName = domainNameCacheRef.current[domain];
        return {
          source_domain: domain,
          source_name: resolvedName || formatSourceName(domain),
          count: sourceCounts.get(domain) || 0
        };
      })
      .sort((a, b) => {
        if (b.count === a.count) {
          return a.source_name.localeCompare(b.source_name);
        }
        return b.count - a.count;
      });

    return { 
      keywords: keywordResults, 
      landmarks: landmarkResults, 
      organizations: organizationResults, 
      sources: sourceResults 
    };
  }, [formatSourceName, resolveSourceNames]);

  // Client-side filtering for immediate feedback - handles mixed content with keyword and source filters
  const applyClientSideFiltering = useCallback((content: FeedContent[], keywords: string[], sources: string[]) => {
    // No filters: just sort by date desc
    if (keywords.length === 0 && sources.length === 0) {
      return [...content].sort((a, b) => new Date(b.content_date).getTime() - new Date(a.content_date).getTime());
    }

    // Keyword/Source filtering for mixed content
    const filtered = content.filter(item => {
      if (item.type === 'story') {
        const story = item.data as Story;

        // Check keyword filter
        const keywordMatch = keywords.length === 0 || (() => {
          const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
          return keywords.some(keyword => {
            const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
            return wordBoundaryRegex.test(text);
          });
        })();

        // Check source filter
        const sourceMatch = sources.length === 0 || (() => {
          if (!story.article?.source_url) return false;
          try {
            const url = new URL(story.article.source_url);
            const domain = url.hostname.replace(/^www\./, '');
            return sources.includes(domain);
          } catch (e) {
            return false;
          }
        })();

        return keywordMatch && sourceMatch;
      }
      // Parliamentary mentions: show only when no keyword/source filters active (already handled above when none)
      if (item.type === 'parliamentary_mention') {
        return keywords.length === 0 && sources.length === 0; 
      }
      return false;
    });

    return filtered.sort((a, b) => new Date(b.content_date).getTime() - new Date(a.content_date).getTime());
  }, [normalizeMPName]);

  // Debounced server-side filtering with sources (Phase 2)
  const triggerServerFiltering = useCallback(async (keywords: string[], sources: string[], expectedVersion: number) => {
    if (!topic) return;

    setIsServerFiltering(true);
    isServerFilteringRef.current = true;
    setPage(0);
    setHasMore(true);
    serverFilteredRef.current = false;

    try {
      await loadStories(
        topic, 
        0, 
        false, 
        keywords.length > 0 ? keywords : null,
        sources.length > 0 ? sources : null // PHASE 2: Pass sources to RPC
      );
      
      // Check if filters changed during the request - discard stale response
      if (filterVersionRef.current !== expectedVersion) {
        console.log('Discarding stale server filter response - filters changed during request');
        return;
      }
      
      serverFilteredRef.current = true;
    } catch (error) {
      console.error('Phase 2: Server filtering failed:', error);
      setIsServerFiltering(false);
      isServerFilteringRef.current = false;
    }
  }, [topic, loadStories]);

  // Handle keyword selection with hybrid filtering (Phase 2: includes sources)
  const toggleKeyword = useCallback((keyword: string) => {
    // Increment filter version to track this change
    filterVersionRef.current++;
    const capturedVersion = filterVersionRef.current;
    
    setSelectedKeywords(prev => {
      const newKeywords = prev.includes(keyword)
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword];

      const combinedKeywords = [...newKeywords, ...selectedLandmarks, ...selectedOrganizations];

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Always filter from complete dataset (allContent) for consistent behavior
      setFilteredContent(applyClientSideFiltering(allContent, combinedKeywords, selectedSources));

      // Debounce server-side filtering (PHASE 2: now includes sources)
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(combinedKeywords, selectedSources, capturedVersion);
      }, DEBOUNCE_DELAY_MS);

      return newKeywords;
    });
  }, [allContent, selectedSources, selectedLandmarks, selectedOrganizations, applyClientSideFiltering, triggerServerFiltering]);

  // Handle source selection (Phase 2: with server-side filtering)
  const toggleSource = useCallback((sourceDomain: string) => {
    // Increment filter version to track this change
    filterVersionRef.current++;
    const capturedVersion = filterVersionRef.current;
    
    setSelectedSources(prev => {
      const newSources = prev.includes(sourceDomain)
        ? prev.filter(s => s !== sourceDomain)
        : [...prev, sourceDomain];

      const combinedKeywords = [...selectedKeywords, ...selectedLandmarks, ...selectedOrganizations];

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Apply client-side filtering immediately for responsiveness
      setFilteredContent(applyClientSideFiltering(allContent, combinedKeywords, newSources));

      // PHASE 2: Debounce server-side filtering for sources too
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(combinedKeywords, newSources, capturedVersion);
      }, DEBOUNCE_DELAY_MS);

      return newSources;
    });
  }, [allContent, selectedKeywords, selectedLandmarks, selectedOrganizations, applyClientSideFiltering, triggerServerFiltering]);

  const clearAllFilters = useCallback(() => {
    const wasServerFiltering = isServerFilteringRef.current;
    
    setSelectedKeywords([]);
    setSelectedLandmarks([]);
    setSelectedOrganizations([]);
    setSelectedSources([]);
    serverFilteredRef.current = false;
    setIsServerFiltering(false);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // If we were server filtering, we need to refetch unfiltered content
    if (wasServerFiltering && topic) {
      // Reset and reload fresh unfiltered content
      setPage(1);
      setHasMore(true);
      loadStories(topic.slug, 1, false);
    } else {
      // Just reset to unfiltered view of current content
      setFilteredContent(allContent);
    }
  }, [allContent, topic, loadStories]);

  const removeKeyword = useCallback((keyword: string) => {
    toggleKeyword(keyword); // This will remove it since it's already selected
  }, [toggleKeyword]);

  const removeSource = useCallback((sourceDomain: string) => {
    toggleSource(sourceDomain); // This will remove it since it's already selected
  }, [toggleSource]);

  const toggleLandmark = useCallback((landmark: string) => {
    // Increment filter version to track this change
    filterVersionRef.current++;
    const capturedVersion = filterVersionRef.current;
    
    setSelectedLandmarks(prev => {
      const newLandmarks = prev.includes(landmark)
        ? prev.filter(l => l !== landmark)
        : [...prev, landmark];

      const combinedKeywords = [...selectedKeywords, ...newLandmarks, ...selectedOrganizations];

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Apply client-side filtering immediately for responsiveness
      setFilteredContent(applyClientSideFiltering(allContent, combinedKeywords, selectedSources));

      // Debounce server-side filtering (combine all filters)
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(combinedKeywords, selectedSources, capturedVersion);
      }, DEBOUNCE_DELAY_MS);

      return newLandmarks;
    });
  }, [allContent, selectedKeywords, selectedOrganizations, selectedSources, applyClientSideFiltering, triggerServerFiltering]);

  const removeLandmark = useCallback((landmark: string) => {
    toggleLandmark(landmark);
  }, [toggleLandmark]);

  const toggleOrganization = useCallback((organization: string) => {
    // Increment filter version to track this change
    filterVersionRef.current++;
    const capturedVersion = filterVersionRef.current;
    
    setSelectedOrganizations(prev => {
      const newOrganizations = prev.includes(organization)
        ? prev.filter(o => o !== organization)
        : [...prev, organization];

      const combinedKeywords = [...selectedKeywords, ...selectedLandmarks, ...newOrganizations];

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Apply client-side filtering immediately for responsiveness
      setFilteredContent(applyClientSideFiltering(allContent, combinedKeywords, selectedSources));

      // Debounce server-side filtering (combine all filters)
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(combinedKeywords, selectedSources, capturedVersion);
      }, DEBOUNCE_DELAY_MS);

      return newOrganizations;
    });
  }, [allContent, selectedKeywords, selectedLandmarks, selectedSources, applyClientSideFiltering, triggerServerFiltering]);

  const removeOrganization = useCallback((organization: string) => {
    toggleOrganization(organization);
  }, [toggleOrganization]);

  const loadMore = useCallback(async () => {
    if (!topic || loadingMore || !hasMore) return;

    const nextPage = page + 1;
    setPage(nextPage);

    // PHASE 2: Pass both keywords and sources when loading more filtered results
    const combinedKeywords = [...selectedKeywords, ...selectedLandmarks, ...selectedOrganizations];
    const keywords = combinedKeywords.length > 0 && serverFilteredRef.current
      ? combinedKeywords
      : null;

    const sources = selectedSources.length > 0 && serverFilteredRef.current
      ? selectedSources
      : null;

    await loadStories(topic, nextPage, true, keywords, sources);
  }, [topic, loadingMore, hasMore, page, selectedKeywords, selectedLandmarks, selectedOrganizations, selectedSources, loadStories]);

  const refresh = useCallback(async () => {
    if (!topic) return;

    setPage(0);
    setHasMore(true);
    serverFilteredRef.current = false;

    // PHASE 2: Refresh with both filters
    const combinedKeywords = [...selectedKeywords, ...selectedLandmarks, ...selectedOrganizations];
    const keywords = combinedKeywords.length > 0 ? combinedKeywords : null;
    const sources = selectedSources.length > 0 ? selectedSources : null;
    await loadStories(topic, 0, false, keywords, sources);

    // Debounced filter index rebuild
    if (refreshIndexDebounceRef.current) {
      clearTimeout(refreshIndexDebounceRef.current);
    }
    refreshIndexDebounceRef.current = setTimeout(() => {
      loadFilterStoryIndex(topic);
    }, 2000);
  }, [topic, selectedKeywords, selectedLandmarks, selectedOrganizations, selectedSources, loadStories, loadFilterStoryIndex]);

  useEffect(() => {
    let cancelled = false;

    const updateFilterOptions = async () => {
      const topicKeywords = topic?.keywords || [];
      const topicLandmarks = topic?.landmarks || [];
      const topicOrganizations = topic?.organizations || [];
      const result = await computeFilterOptionsFromIndex(
        filterStoryIndex,
        topicKeywords,
        topicLandmarks,
        topicOrganizations,
        selectedKeywords,
        selectedLandmarks,
        selectedOrganizations,
        selectedSources
      );

      if (!cancelled) {
        setAvailableKeywords(result.keywords ?? []);
        setAvailableLandmarks(result.landmarks ?? []);
        setAvailableOrganizations(result.organizations ?? []);
        setAvailableSources(result.sources ?? []);
      }
    };

    updateFilterOptions();

    return () => {
      cancelled = true;
    };
  }, [filterStoryIndex, selectedKeywords, selectedLandmarks, selectedOrganizations, selectedSources, topic?.keywords, topic?.landmarks, topic?.organizations, computeFilterOptionsFromIndex]);

  // Track previous keywords length to detect when fresh topic data arrives
  const prevKeywordsLengthRef = useRef<number>(0);
  
  useEffect(() => {
    if (topic) {
      const currentKeywordsLength = (topic.keywords?.length || 0) + 
        (topic.landmarks?.length || 0) + 
        (topic.organizations?.length || 0);
      
      // Force reload if we went from no keywords to having keywords (fresh topic loaded)
      const forceReload = prevKeywordsLengthRef.current === 0 && currentKeywordsLength > 0;
      prevKeywordsLengthRef.current = currentKeywordsLength;
      
      loadFilterStoryIndex(topic, forceReload);
    }
  }, [topic?.id, topic?.keywords, topic?.landmarks, topic?.organizations, loadFilterStoryIndex]);

  // Initialize feed with auto-retry for transient failures
  const MAX_AUTO_RETRIES = 2;
  const RETRY_DELAYS = [2000, 4000]; // 2s, 4s backoff
  
  useEffect(() => {
    const initialize = async (retryAttempt: number = 0) => {
      try {
        console.log(`🚀 Initializing feed for slug: ${slug}${retryAttempt > 0 ? ` (retry ${retryAttempt}/${MAX_AUTO_RETRIES})` : ''}`);
        setLoadError(null);
        
        // PHASE 1: Try to load from cache immediately for instant display
        let cachedEntry = null;
        try {
          cachedEntry = getCachedFeed(slug);
        } catch (cacheError) {
          console.warn('⚠️ Feed cache read failed:', cacheError);
        }
        
        if (cachedEntry && cachedEntry.topic && cachedEntry.stories && cachedEntry.stories.length > 0) {
          console.log('⚡ Found cached feed, displaying instantly');
          
          // Set topic from cache for instant header - ensure all required fields
          const cachedTopic = cachedEntry.topic;
          setTopic({
            id: cachedTopic.id || '',
            name: cachedTopic.name || '',
            slug: cachedTopic.slug || slug,
            topic_type: cachedTopic.topic_type || 'regional',
            region: cachedTopic.region || '',
            description: '',
            keywords: cachedTopic.keywords || [],
            landmarks: cachedTopic.landmarks || [],
            organizations: cachedTopic.organizations || [],
            is_public: true,
            created_by: '',
            branding_config: cachedTopic.branding_config || undefined,
            donation_enabled: cachedTopic.donation_enabled || false,
          });
          setTopicLoading(false);
          
          // Convert cached stories to full format with cached slides (not placeholders)
          const cachedStoryContent: FeedContent[] = cachedEntry.stories
            .filter(story => story && story.id && story.slides && story.slides.length > 0)
            .map(story => ({
              type: 'story' as const,
              id: story.id,
              content_date: story.created_at || new Date().toISOString(),
              data: {
                id: story.id,
                title: story.title || '',
                author: '',
                publication_name: story.publication_name || '',
                created_at: story.created_at || new Date().toISOString(),
                updated_at: story.created_at || new Date().toISOString(),
                cover_illustration_url: story.cover_illustration_url,
                // Use cached slides directly for instant render
                slides: story.slides,
                article: story.article || { 
                  source_url: '#', 
                  published_at: story.created_at || new Date().toISOString(), 
                  region: cachedTopic.region || '' 
                },
                is_parliamentary: story.is_parliamentary || false,
              } as Story
            }));
          
          if (cachedStoryContent.length > 0) {
            setAllContent(cachedStoryContent);
            allContentRef.current = cachedStoryContent;
            setFilteredContent(cachedStoryContent);
            setUsingCachedContent(true);
            
            // Cache is stale or fresh - always show content immediately, refresh in background
            console.log('🔄 Showing cached content, refreshing in background...');
            setStoriesLoading(false);
            setIsRefreshing(true);
          }
        }
        
        // PHASE 2: Load fresh data (always, to ensure latest content)
        const topicData = await loadTopic();
        console.log('✅ Topic loaded:', topicData?.name);
        setTopicLoading(false);
        
        setPage(0);
        console.log('📚 Loading stories for topic:', topicData?.id);
        await loadStories(topicData, 0, false, null, null);
        console.log('✅ Stories loaded successfully');
        
        // Eagerly load filter index for instant availability when Curate button is clicked
        if (topicData) {
          loadFilterStoryIndex(topicData);
        }
        
        // Reset states
        setAutoRetryCount(0);
        setUsingCachedContent(false);
        setIsRefreshing(false);
        
        // PHASE 3: Update cache with fresh data
        const currentStories = allContentRef.current
          .filter(item => item.type === 'story')
          .map(item => item.data);
        
        if (topicData && currentStories.length > 0) {
          setCachedFeed(slug, topicData, currentStories);
          console.log('💾 Feed cached for instant loading');
        }
        
      } catch (error: any) {
        console.error('Error initializing hybrid feed:', error);
        
        // Auto-retry for transient failures (timeouts, network errors)
        const isTransientError = 
          error?.message?.includes('timeout') ||
          error?.message?.includes('abort') ||
          error?.message?.includes('fetch') ||
          error?.message?.includes('network') ||
          error?.code === '544' ||
          error?.name === 'AbortError';
        
        if (isTransientError && retryAttempt < MAX_AUTO_RETRIES) {
          const delay = RETRY_DELAYS[retryAttempt] || 4000;
          console.log(`🔄 Auto-retry ${retryAttempt + 1}/${MAX_AUTO_RETRIES} in ${delay/1000}s...`);
          setAutoRetryCount(retryAttempt + 1);
          
          autoRetryRef.current = setTimeout(() => {
            initialize(retryAttempt + 1);
          }, delay);
          return;
        }
        
        // All retries exhausted or non-transient error
        setLoadError(error?.message || 'Failed to load feed');
        setRetryCount(retryAttempt);
        setTopicLoading(false);
        setStoriesLoading(false);
        setIsRefreshing(false);
      }
    };

    if (slug) {
      // Clear any pending retry
      if (autoRetryRef.current) {
        clearTimeout(autoRetryRef.current);
      }
      initialize(0);
    }
    
    return () => {
      if (autoRetryRef.current) {
        clearTimeout(autoRetryRef.current);
      }
    };
  }, [slug, loadTopic, loadStories]);

  // Real-time subscription for new stories and slide updates
  useEffect(() => {
    if (!topic || hasSetupRealtimeRef.current) return;
    
    hasSetupRealtimeRef.current = true;
    console.log('📡 Setting up realtime subscription for topic:', topic.id);

    const channel = supabase
      .channel(`topic-feed-realtime-${topic.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stories',
          filter: `is_published=eq.true`
        },
        async (payload) => {
          console.log('🔄 New published story detected:', payload);
          const newStory = payload.new as any;
          
          // Verify story belongs to this topic
          let belongsToTopic = false;
          if (newStory.topic_article_id) {
            const { data: topicArticle } = await supabase
              .from('topic_articles')
              .select('topic_id')
              .eq('id', newStory.topic_article_id)
              .single();
            belongsToTopic = topicArticle?.topic_id === topic.id;
          } else if (newStory.article_id) {
            const { data: article } = await supabase
              .from('articles')
              .select('topic_id')
              .eq('id', newStory.article_id)
              .single();
            belongsToTopic = article?.topic_id === topic.id;
          }
          
          if (belongsToTopic) {
            console.log('✅ Story belongs to current topic, showing new stories button');
            setNewStoryCount(prev => prev + 1);
            setHasNewStories(true);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories',
          filter: `is_published=eq.true`
        },
        async (payload) => {
          console.log('🔄 Story published/updated in real-time:', payload);
          const updatedStory = payload.new as any;
          const oldStory = payload.old as any;
          
          // Only handle if story was just published
          if (!oldStory.is_published && updatedStory.is_published) {
            // Verify story belongs to this topic
            let belongsToTopic = false;
            if (updatedStory.topic_article_id) {
              const { data: topicArticle } = await supabase
                .from('topic_articles')
                .select('topic_id')
                .eq('id', updatedStory.topic_article_id)
                .single();
              belongsToTopic = topicArticle?.topic_id === topic.id;
            } else if (updatedStory.article_id) {
              const { data: article } = await supabase
                .from('articles')
                .select('topic_id')
                .eq('id', updatedStory.article_id)
                .single();
              belongsToTopic = article?.topic_id === topic.id;
            }
            
            if (belongsToTopic) {
              console.log('✅ Story was published, showing new stories button');
              setNewStoryCount(prev => prev + 1);
              setHasNewStories(true);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'slides'
        },
        (payload) => {
          console.log('🔄 Slide updated in real-time:', payload);
          
          // Invalidate React Query cache to force refetch
          queryClient.invalidateQueries({ queryKey: ['topic-feed'] });
          queryClient.invalidateQueries({ queryKey: ['hybrid-topic-feed'] });
          
          // Also refresh the hook's internal state
          setTimeout(() => {
            refresh();
          }, 500);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'topics',
          filter: `id=eq.${topic.id}`
        },
        (payload) => {
          console.log('🔄 Topic updated in real-time:', payload);
          // Reload topic data to get updated branding_config
          loadTopic().then(updatedTopic => {
            setTopic(updatedTopic);
          });
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime connection status:', status);
        setIsLive(status === 'SUBSCRIBED');
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription active for topic:', topic.id);
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Realtime connection closed');
          hasSetupRealtimeRef.current = false;
        }
      });

    return () => {
      console.log('🔌 Cleaning up realtime subscription');
      setIsLive(false);
      hasSetupRealtimeRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [topic?.id, slug]);

  // Page Visibility API - Auto-refresh when tab becomes visible after 5+ minutes
  useEffect(() => {
    if (!topic) return;
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible again
        const lastRefreshKey = `feed_last_refresh_${topic.id}`;
        const lastRefresh = localStorage.getItem(lastRefreshKey);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        // Only refresh if it's been more than 5 minutes since last refresh
        if (!lastRefresh || now - parseInt(lastRefresh) > fiveMinutes) {
          console.log('🔄 Tab visible again after 5+ minutes, auto-refreshing feed...');
          refresh();
          localStorage.setItem(lastRefreshKey, now.toString());
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [topic, refresh]);

  // Force re-subscription when topic changes
  useEffect(() => {
    hasSetupRealtimeRef.current = false;
  }, [topic?.id]);

  // Cleanup debounce and filter timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (filterIndexTimeoutRef.current) {
        clearTimeout(filterIndexTimeoutRef.current);
      }
    };
  }, []);

  // Create a retry function that clears error state
  const retryLoad = useCallback(() => {
    setLoadError(null);
    refresh();
  }, [refresh]);

  // Compute filter readiness - true when:
  // 1. Filter options are populated, OR
  // 2. Timeout was reached (fallback), OR  
  // 3. Topic has no filter terms configured (nothing to load)
  const hasNoFilterTermsConfigured = 
    (!topic?.keywords?.length) && 
    (!topic?.landmarks?.length) && 
    (!topic?.organizations?.length);

  const filterOptionsReady = 
    filterIndexTimedOut ||
    hasNoFilterTermsConfigured ||
    availableKeywords.length > 0 || 
    availableLandmarks.length > 0 || 
    availableOrganizations.length > 0 || 
    availableSources.length > 0;

  return {
    // Story data
    stories: filteredStories,
    content: filteredContent,
    topic,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
    isLive,
    
    // Split loading states for instant header rendering
    topicLoading,
    storiesLoading,
    isRefreshing,
    usingCachedContent,
    
    // Error state for mobile retry UI
    loadError,
    retryCount,
    retryLoad,
    
    // New stories notification
    hasNewStories,
    newStoryCount,
    refreshFromNewStories: () => {
      setHasNewStories(false);
      setNewStoryCount(0);
      refresh();
    },
    
    // Keyword filtering
    selectedKeywords,
    availableKeywords,
    isModalOpen,
    setIsModalOpen,
    toggleKeyword,
    clearAllFilters,
    removeKeyword,
    hasActiveFilters: selectedKeywords.length > 0 || selectedLandmarks.length > 0 || selectedOrganizations.length > 0 || selectedSources.length > 0,
    isServerFiltering,
    
    // Landmark filtering
    selectedLandmarks,
    availableLandmarks,
    toggleLandmark,
    removeLandmark,
    
    // Organization filtering
    selectedOrganizations,
    availableOrganizations,
    toggleOrganization,
    removeOrganization,
    
    // Source filtering
    selectedSources,
    availableSources,
    toggleSource,
    removeSource,

    ensureFilterStoryIndexLoaded,
    
    // Filter readiness state for Curate button
    filterIndexLoading,
    filterOptionsReady
  };
};