import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface Story {
  id: string;
  title: string;
  author: string;
  publication_name: string;
  created_at: string;
  updated_at: string;
  cover_illustration_url?: string;
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

const STORIES_PER_PAGE = 10;
const DEBOUNCE_DELAY_MS = 500;

// Enhanced Story interface to include parliamentary mentions
interface FeedContent {
  type: 'story' | 'parliamentary_mention';
  id: string;
  content_date: string; // Used for chronological sorting
  data: Story | ParliamentaryMention;
}

interface ParliamentaryMention {
  id: string;
  mention_type: string;
  mp_name: string | null;
  constituency: string | null;
  party: string | null;
  vote_title: string | null;
  vote_direction: string | null;
  vote_date: string | null;
  vote_url: string | null;
  debate_title: string | null;
  debate_excerpt: string | null;
  debate_date: string | null;
  hansard_url: string | null;
  region_mentioned: string | null;
  landmark_mentioned: string | null;
  relevance_score: number;
  created_at: string;
}

export const useHybridTopicFeedWithKeywords = (slug: string) => {
  // Base data state
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [allContent, setAllContent] = useState<FeedContent[]>([]);
  const [filteredContent, setFilteredContent] = useState<FeedContent[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);
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
      console.log('🔍 loadTopic: Starting topic load for slug:', slug);
      const { data: topics, error: topicError } = await supabase
        .from('safe_public_topics')
        .select('id, name, description, topic_type, region, slug, is_public, is_active, created_at');

      console.log('🔍 loadTopic: RPC response:', { topics, error: topicError });

      if (topicError) throw topicError;

      // Case-insensitive slug matching
      const topicData = topics?.find(t => t.slug?.toLowerCase() === slug.toLowerCase());
      console.log('🔍 loadTopic: Found topic data:', topicData);
      
      if (!topicData) throw new Error('Topic not found');

      const { data: fullTopicData, error: keywordError } = await supabase
        .from('topics')
        .select('keywords, landmarks, organizations, branding_config, donation_enabled, donation_config')
        .ilike('slug', slug)
        .eq('is_public', true)
        .single();
      
      let topicKeywords: string[] = [];
      let topicLandmarks: string[] = [];
      let topicOrganizations: string[] = [];
      let brandingConfig = {};
      let donationEnabled = false;
      let donationConfig: any = { button_text: "Support this feed", tiers: [] };
      if (!keywordError && fullTopicData) {
        topicKeywords = Array.isArray(fullTopicData.keywords) ? fullTopicData.keywords : [];
        topicLandmarks = Array.isArray(fullTopicData.landmarks) ? fullTopicData.landmarks : [];
        topicOrganizations = Array.isArray(fullTopicData.organizations) ? fullTopicData.organizations : [];
        brandingConfig = fullTopicData.branding_config || {};
        donationEnabled = fullTopicData.donation_enabled || false;
        donationConfig = (fullTopicData.donation_config as any) || { button_text: "Support this feed", tiers: [] };
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
        donation_config: donationConfig as any
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
            console.warn('⚠️ Fallback: Failed to load slides via RPC, attempting direct query', slidesError);
            const { data: fallbackSlides, error: fallbackError } = await supabase
              .from('slides')
              .select('id,story_id,slide_number,content,word_count')
              .in('story_id', storyIds)
              .order('slide_number', { ascending: true });

            if (fallbackError) {
              throw fallbackError;
            }

            slidesData = fallbackSlides || [];
          } else {
            slidesData = slides || [];
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

          return {
            id: story.id,
            title: story.title,
            author: story.author || 'Unknown',
            publication_name: story.publication_name || '',
            created_at: story.created_at,
            updated_at: story.updated_at,
            cover_illustration_url: story.cover_illustration_url,
            cover_illustration_prompt: story.cover_illustration_prompt,
            slides: storySlides,
            is_parliamentary: false,
            mp_name: undefined,
            mp_names: [],
            article: {
              source_url: story.article_source_url || '#',
              published_at: story.article_published_at || story.created_at,
              region: topicData.region || 'Unknown'
            }
          };
        });

        const storyContent: FeedContent[] = transformedStories.map(story => ({
          type: 'story',
          id: story.id,
          content_date: story.article.published_at || story.created_at,
          data: story
        }));

        let parliamentaryMentions: ParliamentaryMention[] = [];
        if (
          topicData.topic_type === 'regional' &&
          topicData.parliamentary_tracking_enabled &&
          pageNum === 0
        ) {
          try {
            const { data: mentionsData, error: mentionsError } = await supabase
              .from('parliamentary_mentions')
              .select('*')
              .eq('topic_id', topicData.id)
              .gte('relevance_score', 30)
              .order('created_at', { ascending: false })
              .limit(20);

            if (!mentionsError && mentionsData) {
              parliamentaryMentions = mentionsData;
            }
          } catch (error) {
            console.warn('⚠️ Fallback: Failed to load parliamentary mentions:', error);
          }
        }

        const parliamentaryContent: FeedContent[] = parliamentaryMentions.map(mention => ({
          type: 'parliamentary_mention' as const,
          id: mention.id,
          content_date: mention.vote_date || mention.debate_date || mention.created_at,
          data: mention
        }));

        const mergedContent = [...storyContent, ...parliamentaryContent]
          .filter(item => !!item?.id)
          .reduce<Map<string, FeedContent>>((acc, item) => {
            if (!acc.has(item.id)) {
              acc.set(item.id, item);
            }
            return acc;
          }, new Map())
          .values();

        const orderedContent = Array.from(mergedContent).sort((a, b) => {
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
        if (isServerFilteringRef.current) setLoadingMore(true);
        else setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Use a larger raw rows limit - increase when filters active to improve matching
      const rawLimit = (keywords || sources) ? STORIES_PER_PAGE * 15 : STORIES_PER_PAGE * 8;
      const from = pageNum * rawLimit;
      
      console.log('🔍 Phase 2: Loading stories with filters', { 
        topicId: topicData.id, 
        page: pageNum, 
        keywords: keywords?.length || 0,
        sources: sources?.length || 0,
        rawLimit,
        from
      });

      // PHASE 2: Circuit breaker - 15 second timeout with AbortController (increased for iOS Safari)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Phase 2: RPC timeout after 15 seconds, aborting...');
        controller.abort();
      }, 15000);

      let storiesData: any[] | null = null;
      let rpcError: any = null;
      const currentAllContent = allContentRef.current;

      try {
        const { data, error } = await supabase
          .rpc('get_topic_stories_with_keywords', {
            p_topic_id: topicData.id,
            p_keywords: keywords,
            p_source_domains: sources,
            p_limit: rawLimit,
            p_offset: from
          })
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
            status: row.story_status,
            is_published: row.story_is_published,
            created_at: row.story_created_at,
            cover_illustration_url: row.story_cover_url,
            article_source_url: row.article_source_url,
            article_published_at: row.article_published_at,
            article_id: row.article_id,
            shared_content_id: row.shared_content_id,
            is_parliamentary: row.story_is_parliamentary || false,
            mp_name: row.mp_name || undefined,
            mp_party: row.mp_party || undefined,
            constituency: row.constituency || undefined,
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
      
      console.log('🔍 [GROUPING] Grouped into', storyMap.size, 'unique stories');
      
      // Fetch full slide sets for all matched stories to ensure complete slide data
      const storyIds = Array.from(storyMap.keys());
      const chunkSize = 50;
      const slideMap = new Map<string, any[]>();
      for (let i = 0; i < storyIds.length; i += chunkSize) {
        const chunk = storyIds.slice(i, i + chunkSize);
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
      // Replace slides with the complete sets when available
      slideMap.forEach((slides, sid) => {
        const storyData = storyMap.get(sid);
        if (storyData) {
          storyData.slides = slides.sort((a: any, b: any) => a.slide_number - b.slide_number);
        }
      });
      
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

      // Fetch popularity data for all stories
      const storyIdsForPopularity = Array.from(storyMap.keys());
      let popularityMap = new Map();
      if (storyIdsForPopularity.length > 0) {
        try {
          const { data: popularityData, error: popularityError } = await supabase
            .rpc('get_popular_stories_by_period', {
              p_topic_id: topicData.id
            });
          
          if (!popularityError && popularityData) {
            popularityData.forEach((item: any) => {
              popularityMap.set(item.story_id, {
                period_type: item.period_type,
                swipe_count: item.swipe_count,
                rank_position: item.rank_position
              });
            });
          }
        } catch (error) {
          console.warn('⚠️ Failed to load popularity data:', error);
        }
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
          
        return {
          id: story.id,
          title: story.title,
          author: 'Unknown',
          publication_name: '',
          created_at: story.created_at,
          updated_at: story.created_at,
          cover_illustration_url: story.cover_illustration_url,
          cover_illustration_prompt: '',
          popularity_data: popularityMap.get(story.id),
          slides: sortedSlides,
          is_parliamentary: !!story.is_parliamentary,
          mp_name: story.mp_name,
          mp_names: Array.from((story.mp_names || new Set<string>()) as Set<string>)
            .map(n => normalizeMPName(n))
            .filter((n): n is string => !!n),
          mp_party: story.mp_party,
          constituency: story.constituency,
          article: {
            source_url: story.article_source_url || '#',
            published_at: story.article_published_at,
            region: topicData.region || 'Unknown'
          }
        };
      });

      // Fetch parliamentary mentions if enabled for regional topics
      let parliamentaryMentions: ParliamentaryMention[] = [];
      if (topicData.topic_type === 'regional' && topicData.parliamentary_tracking_enabled && pageNum === 0) {
        try {
          const { data: mentionsData, error: mentionsError } = await supabase
            .from('parliamentary_mentions')
            .select('*')
            .eq('topic_id', topicData.id)
            .gte('relevance_score', 30)
            .order('created_at', { ascending: false })
            .limit(20);

          if (!mentionsError && mentionsData) {
            parliamentaryMentions = mentionsData;
          }
        } catch (error) {
          console.warn('Failed to load parliamentary mentions:', error);
        }
      }

      const storyContent: FeedContent[] = transformedStories.map(story => ({
        type: 'story' as const,
        id: story.id,
        content_date: story.article.published_at, // strictly use published_at to avoid reordering on updates
        data: story
      }));

      const parliamentaryContent: FeedContent[] = parliamentaryMentions.map(mention => ({
        type: 'parliamentary_mention' as const,
        id: mention.id,
        content_date: mention.vote_date || mention.debate_date || mention.created_at,
        data: mention
      }));

      // Defensive deduplication: use Map to ensure each ID appears exactly once
      console.log('🔍 [DEDUP] Before dedup:', storyContent.length, 'stories', parliamentaryContent.length, 'parliamentary');
      const contentMap = new Map<string, FeedContent>();
      [...storyContent, ...parliamentaryContent].forEach(item => {
        if (item?.id) {
          if (!contentMap.has(item.id)) {
            contentMap.set(item.id, item);
          } else {
            const existing = contentMap.get(item.id);
            console.warn(`⚠️ [DEDUP] Duplicate content detected:`, {
              id: item.id.substring(0, 8),
              type: item.type,
              title: item.type === 'story' ? (item.data as any).title?.substring(0, 50) : '',
              existingSlides: item.type === 'story' ? (existing?.data as any).slides?.length : 0,
              newSlides: item.type === 'story' ? (item.data as any).slides?.length : 0
            });
          }
        }
      });
      console.log('🔍 [DEDUP] After dedup:', contentMap.size, 'unique items');

      const now = new Date().getTime();
      const mixedContent = Array.from(contentMap.values())
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

      console.log('🔍 Mixed content ordering:', mixedContent.slice(0, 5).map(item => ({
        type: item.type,
        id: item.id.substring(0, 8),
        date: item.content_date,
        title: item.type === 'story' ? (item.data as any).title : (item.data as any).vote_title || (item.data as any).debate_title
      })));

      if (append) {
        console.log('🔍 [APPEND] Appending', transformedStories.length, 'new stories to existing content');
        setAllStories(prev => {
          const combined = [...prev, ...transformedStories];
          console.log('🔍 [APPEND] AllStories now has', combined.length, 'stories');
          return combined;
        });
        
        // Merge new stories with existing mixed content and re-sort chronologically with deduplication
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
          const merged = Array.from(contentMap.values()).sort((a, b) => {
            const aTime = new Date(a.content_date).getTime();
            const bTime = new Date(b.content_date).getTime();
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          });
          console.log('🔍 [APPEND] AllContent now has', merged.length, 'items');
          allContentRef.current = merged;
          return merged;
        });

        setFilteredContent(prev => {
          console.log('🔍 [APPEND] Merging into filteredContent, prev had', prev.length, 'items');
          const contentMap = new Map<string, FeedContent>();
          const base = keywords || sources ? [...prev.filter(item => item.type === 'story')] : prev;
          [...base, ...storyContent].forEach(item => {
            if (!contentMap.has(item.id)) {
              contentMap.set(item.id, item);
            } else {
              console.warn('🔍 [APPEND] Skipping duplicate in filteredContent:', item.id.substring(0, 8));
            }
          });

          const merged = Array.from(contentMap.values()).sort((a, b) => {
            const aTime = new Date(a.content_date).getTime();
            const bTime = new Date(b.content_date).getTime();
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          });

          if (keywords || sources) {
            const filtered = merged.filter(item => item.type === 'story');
            console.log('🔍 [APPEND] FilteredContent now has', filtered.length, 'stories (filtered)');
            return filtered;
          }

          console.log('🔍 [APPEND] FilteredContent now has', merged.length, 'items');
          return merged;
        });
      } else {
        console.log('🔍 [INITIAL] Setting initial content:', transformedStories.length, 'stories', mixedContent.length, 'mixed items');
        setAllStories(transformedStories);
        // For initial load, use the mixed content with proper chronological order
        setAllContent(mixedContent);
        allContentRef.current = mixedContent;
        if (!keywords && !sources) {
          setFilteredContent(mixedContent);
          console.log('🔍 [INITIAL] FilteredContent set to', mixedContent.length, 'mixed items (no filters)');
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
      console.error('Error loading stories:', error);
      
      // Don't show destructive toast for timeout fallbacks - they're handled gracefully
      const errorMessage = error instanceof Error ? error.message : "Failed to load stories";
      const isTimeoutFallback = errorMessage.includes('cached content');
      
      if (!isTimeoutFallback) {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsServerFiltering(false);
      isServerFilteringRef.current = false;
    }
  }, [slug, loadStoriesFromPublicFeed, normalizeMPName]);

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

  const loadFilterStoryIndex = useCallback(async (topicData: Topic | null) => {
    if (!topicData?.id || filterIndexLoadingRef.current) return;

    filterIndexLoadingRef.current = true;
    console.log('🔍 [FILTER INDEX] Starting load for topic:', {
      topicId: topicData.id,
      topicSlug: topicData.slug,
      topicName: topicData.name,
      timestamp: new Date().toISOString()
    });

    try {
      const keywords = topicData.keywords || [];
      const landmarks = topicData.landmarks || [];
      const organizations = topicData.organizations || [];
      const allTerms = [...keywords, ...landmarks, ...organizations];
      const keywordsLower = allTerms.map(keyword => keyword.toLowerCase());
      console.log('📋 Tracking terms:', { keywords: keywords.length, landmarks: landmarks.length, organizations: organizations.length });

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
          p_keywords: null,
          p_source_domains: null,
          p_limit: limit,
          p_offset: offset
        });

        let rows = data || [];
        let usedFallback = false;

        if (error) {
          console.error('❌ Failed to load filter index batch:', {
            error,
            message: error.message,
            details: error.details,
            hint: error.hint,
            params: { p_topic_id: topicData.id, offset, limit }
          });

          console.error('❌ RPC failed, attempting direct query fallback');
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
            if (keyword && combinedText.includes(keyword)) {
              matches.add(keyword);
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
    } catch (error) {
      console.warn('⚠️ Failed to build filter story index:', error);
    } finally {
      filterIndexLoadingRef.current = false;
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

    const matchingStories = index.filter(story => {
      const matchesKeywords = activeKeywordSet.size === 0 || Array.from(activeKeywordSet).every(keyword => story.keywordMatches.includes(keyword));
      const matchesLandmarks = activeLandmarkSet.size === 0 || Array.from(activeLandmarkSet).every(landmark => story.keywordMatches.includes(landmark));
      const matchesOrganizations = activeOrganizationSet.size === 0 || Array.from(activeOrganizationSet).every(org => story.keywordMatches.includes(org));
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

    const keywordResults: KeywordCount[] = Array.from(keywordCounts.entries())
      .filter(([keyword, count]) => count > 0 || activeKeywordSet.has(keyword))
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

    const landmarkResults: KeywordCount[] = Array.from(landmarkCounts.entries())
      .filter(([landmark, count]) => count > 0 || activeLandmarkSet.has(landmark))
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

    const organizationResults: KeywordCount[] = Array.from(organizationCounts.entries())
      .filter(([org, count]) => count > 0 || activeOrganizationSet.has(org))
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
          return keywords.some(keyword => text.includes(keyword.toLowerCase()));
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
  const triggerServerFiltering = useCallback(async (keywords: string[], sources: string[]) => {
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
    } catch (error) {
      console.error('Phase 2: Server filtering failed:', error);
      setIsServerFiltering(false);
      isServerFilteringRef.current = false;
    }
  }, [topic, loadStories]);

  // Handle keyword selection with hybrid filtering (Phase 2: includes sources)
  const toggleKeyword = useCallback((keyword: string) => {
    setSelectedKeywords(prev => {
      const newKeywords = prev.includes(keyword)
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword];

      const combinedKeywords = [...newKeywords, ...selectedLandmarks, ...selectedOrganizations];

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Apply immediate client-side filtering if we have server-filtered data
      if (serverFilteredRef.current || combinedKeywords.length === 0) {
        const baseContent = combinedKeywords.length === 0 ? allContent : filteredContent;
        setFilteredContent(applyClientSideFiltering(baseContent, combinedKeywords, selectedSources));
      } else {
        // Apply client-side filtering immediately for responsiveness
        setFilteredContent(applyClientSideFiltering(allContent, combinedKeywords, selectedSources));
      }

      // Debounce server-side filtering (PHASE 2: now includes sources)
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(combinedKeywords, selectedSources);
      }, DEBOUNCE_DELAY_MS);

      return newKeywords;
    });
  }, [allContent, filteredContent, selectedSources, selectedLandmarks, selectedOrganizations, applyClientSideFiltering, triggerServerFiltering]);

  // Handle source selection (Phase 2: with server-side filtering)
  const toggleSource = useCallback((sourceDomain: string) => {
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
        triggerServerFiltering(combinedKeywords, newSources);
      }, DEBOUNCE_DELAY_MS);

      return newSources;
    });
  }, [allContent, selectedKeywords, selectedLandmarks, selectedOrganizations, applyClientSideFiltering, triggerServerFiltering]);

  const clearAllFilters = useCallback(() => {
    setSelectedKeywords([]);
    setSelectedLandmarks([]);
    setSelectedOrganizations([]);
    setSelectedSources([]);
    setFilteredContent(allContent);
    serverFilteredRef.current = false;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, [allContent]);

  const removeKeyword = useCallback((keyword: string) => {
    toggleKeyword(keyword); // This will remove it since it's already selected
  }, [toggleKeyword]);

  const removeSource = useCallback((sourceDomain: string) => {
    toggleSource(sourceDomain); // This will remove it since it's already selected
  }, [toggleSource]);

  const toggleLandmark = useCallback((landmark: string) => {
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
        triggerServerFiltering(combinedKeywords, selectedSources);
      }, DEBOUNCE_DELAY_MS);

      return newLandmarks;
    });
  }, [allContent, selectedKeywords, selectedOrganizations, selectedSources, applyClientSideFiltering, triggerServerFiltering]);

  const removeLandmark = useCallback((landmark: string) => {
    toggleLandmark(landmark);
  }, [toggleLandmark]);

  const toggleOrganization = useCallback((organization: string) => {
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
        triggerServerFiltering(combinedKeywords, selectedSources);
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

  useEffect(() => {
    if (topic) {
      loadFilterStoryIndex(topic);
    }
  }, [topic?.id, topic?.keywords, topic?.landmarks, topic?.organizations, loadFilterStoryIndex]);

  // Initialize feed
  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('🚀 Initializing feed for slug:', slug);
        const topicData = await loadTopic();
        console.log('✅ Topic loaded:', topicData?.name);
        setPage(0);
        console.log('📚 Loading stories for topic:', topicData?.id);
        await loadStories(topicData, 0, false, null, null);
        console.log('✅ Stories loaded successfully');
        
      } catch (error) {
        console.error('Error initializing hybrid feed:', error);
        setLoading(false);
      }
    };

    if (slug) {
      initialize();
    }
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
            console.log('✅ Story belongs to current topic, refreshing feed...');
            toast({
              title: "New story published",
              description: newStory.title || "A new story is now available"
            });
            
            // Refresh the feed to include the new story
            setTimeout(() => {
              refresh();
            }, 1000);
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
              console.log('✅ Story was published, refreshing feed...');
              toast({
                title: "New story published",
                description: updatedStory.title || "A new story is now available"
              });
              
              setTimeout(() => {
                refresh();
              }, 1000);
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
  }, [topic?.id, refresh, queryClient, slug]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

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

    ensureFilterStoryIndexLoaded
  };
};