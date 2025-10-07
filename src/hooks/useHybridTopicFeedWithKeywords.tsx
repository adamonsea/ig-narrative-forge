import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

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
}

interface Topic {
  id: string;
  name: string;
  description: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  is_public: boolean;
  created_by: string;
  parliamentary_tracking_enabled?: boolean;
  branding_config?: {
    logo_url?: string;
    subheader?: string;
    show_topic_name?: boolean;
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
  
  // Keyword filtering state
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isServerFiltering, setIsServerFiltering] = useState(false);
  const [availableKeywords, setAvailableKeywords] = useState<KeywordCount[]>([]);
  
  // Source filtering state
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [availableSources, setAvailableSources] = useState<SourceCount[]>([]);
  
  // Refs for debouncing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serverFilteredRef = useRef(false);
  const preferGlobalFiltersRef = useRef(false);
  
  // Derived filtered stories for backward compatibility
  const filteredStories = filteredContent.filter(item => item.type === 'story').map(item => item.data as Story);

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
        .select('keywords, landmarks, organizations, branding_config')
        .ilike('slug', slug)
        .eq('is_public', true)
        .single();
      
      let topicKeywords: string[] = [];
      let brandingConfig = {};
      if (!keywordError && fullTopicData) {
        topicKeywords = [
          ...(fullTopicData.keywords || []),
          ...(fullTopicData.landmarks || []),
          ...(fullTopicData.organizations || [])
        ];
        brandingConfig = fullTopicData.branding_config || {};
      }

      const topicObject = {
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword',
        keywords: topicKeywords,
        is_public: topicData.is_public,
        created_by: '',
        branding_config: brandingConfig as any
      };

      console.log('🔍 loadTopic: Setting topic object:', topicObject);
      setTopic(topicObject);
      return topicObject;
    } catch (error) {
      console.error('❌ Error loading topic:', error);
      throw error;
    }
  }, [slug]);

  const loadStories = useCallback(async (
    topicData: any, 
    pageNum: number = 0, 
    append: boolean = false,
    keywords: string[] | null = null,
    sources: string[] | null = null
  ) => {
    try {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

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

      // PHASE 2: Circuit breaker - 5 second timeout with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Phase 2: RPC timeout after 5 seconds, aborting...');
        controller.abort();
      }, 5000);

      let storiesData: any[] | null = null;
      let rpcError: any = null;

      try {
        const { data, error } = await supabase
          .rpc('get_topic_stories_with_keywords', {
            p_topic_slug: (topicData?.slug ?? slug)?.toLowerCase(),
            p_keywords: keywords,
            p_sources: sources, // PHASE 2: New source filtering parameter
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
          rpcError = new Error('RPC timeout after 5 seconds');
        } else {
          rpcError = err;
        }
      }

      // PHASE 2: If RPC failed, fall back to client-side filtering
      if (rpcError) {
        console.error('🚨 Phase 2: RPC failed, falling back to client-side filtering:', rpcError);
        
        if (!append && allContent.length > 0) {
          // Apply client-side filtering to existing loaded content
          console.log('🔄 Phase 2: Using client-side filtering on existing content');
          const filtered = applyClientSideFiltering(
            allContent, 
            keywords || [], 
            sources || []
          );
          setFilteredContent(filtered);
          setHasMore(false); // Can't paginate with client-side filtering
          return;
        } else {
          // No content to filter, throw error
          throw rpcError;
        }
      }

      if (!storiesData || storiesData.length === 0) {
        console.log('📄 Phase 2: No stories found');
        if (!append) {
          setAllStories([]);
          setAllContent([]);
          setFilteredContent([]);
        }
        setHasMore(false);
        return;
      }

      // Group RPC results by story_id since it returns one row per slide
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
            slides: [],
            slideIds: new Set() // Track slide IDs to prevent duplicates
          });
          storySlideCountMap.set(row.story_id, 0);
        }
        
        // Add slide if it exists and hasn't been added yet
        if (row.slide_id) {
          const storyData = storyMap.get(row.story_id);
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
      
      // If filters are active, fetch full slide sets for matched stories to avoid slide reductions
      if (keywords || sources) {
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
      }
      
      // Log slide counts when filtering to detect incomplete stories
      if (keywords || sources) {
        const slideCounts = Array.from(storySlideCountMap.entries()).map(([storyId, count]) => ({
          storyId: storyId.substring(0, 8),
          slideCount: count
        }));
        console.log('📊 Stories with slide counts:', slideCounts.slice(0, 5));
        
        // Warn if any story has very few slides (might indicate missing slides)
        slideCounts.forEach(({ storyId, slideCount }) => {
          if (slideCount < 3) {
            console.warn(`⚠️ Story ${storyId} has only ${slideCount} slide(s) - might be incomplete due to filtering`);
          }
        });
      }
      
      const uniqueStories = Array.from(storyMap.values());
      const pageUniqueStories = uniqueStories;

      // Fetch popularity data for all stories
      const storyIds = Array.from(storyMap.keys());
      let popularityMap = new Map();
      if (storyIds.length > 0) {
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
      const contentMap = new Map<string, FeedContent>();
      [...storyContent, ...parliamentaryContent].forEach(item => {
        if (item?.id) {
          if (!contentMap.has(item.id)) {
            contentMap.set(item.id, item);
          } else {
            console.warn(`⚠️ Duplicate content ID detected and removed: ${item.id.substring(0, 8)}...`);
          }
        }
      });

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
        setAllStories(prev => [...prev, ...transformedStories]);
        // Merge new stories with existing mixed content and re-sort chronologically with deduplication
        setAllContent(prev => {
          const contentMap = new Map<string, FeedContent>();
          [...prev, ...storyContent].forEach(item => {
            if (!contentMap.has(item.id)) {
              contentMap.set(item.id, item);
            }
          });
          return Array.from(contentMap.values()).sort((a, b) => {
            const aTime = new Date(a.content_date).getTime();
            const bTime = new Date(b.content_date).getTime();
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          });
        });
        if (!keywords || keywords.length === 0) {
          setFilteredContent(prev => {
            const contentMap = new Map<string, FeedContent>();
            [...prev, ...storyContent].forEach(item => {
              if (!contentMap.has(item.id)) {
                contentMap.set(item.id, item);
              }
            });
            return Array.from(contentMap.values()).sort((a, b) => {
              const aTime = new Date(a.content_date).getTime();
              const bTime = new Date(b.content_date).getTime();
              return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
            });
          });
        }
      } else {
        setAllStories(transformedStories);
        // For initial load, use the mixed content with proper chronological order
        setAllContent(mixedContent);
        if (!keywords || keywords.length === 0) {
          setFilteredContent(mixedContent);
        } else {
          // For keyword filtering, only include stories for now
          setFilteredContent(storyContent);
          serverFilteredRef.current = true;
        }
      }
      
      // Determine if there might be more data
      // When filters are active, check if we got enough unique stories
      // When no filters, check if we got a full batch of raw rows
      if (keywords || sources) {
        // With filters: assume more if we got exactly STORIES_PER_PAGE unique stories
        setHasMore(pageUniqueStories.length >= STORIES_PER_PAGE);
      } else {
        // No filters: check raw batch size
        setHasMore((storiesData?.length || 0) === rawLimit);
      }
      
    } catch (error) {
      console.error('Error loading stories:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load stories",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsServerFiltering(false);
    }
  }, [slug]);

  // Calculate available keywords from all loaded stories
  // When source filter is active, only count keywords in stories from that source
  const updateAvailableKeywords = useCallback((stories: Story[], topicKeywords: string[], activeSources: string[]) => {
    if (topicKeywords.length === 0) {
      setAvailableKeywords([]);
      return;
    }

    const keywordCounts = new Map<string, number>();
    
    topicKeywords.forEach(keyword => {
      keywordCounts.set(keyword.toLowerCase(), 0);
    });

    // Filter stories by active sources first if applicable
    const storiesToCount = activeSources.length > 0 
      ? stories.filter(story => {
          if (!story.article?.source_url) return false;
          try {
            const url = new URL(story.article.source_url);
            const domain = url.hostname.replace(/^www\./, '');
            return activeSources.includes(domain);
          } catch (e) {
            return false;
          }
        })
      : stories;

    storiesToCount.forEach(story => {
      const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
      
      topicKeywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        const regex = new RegExp(keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = text.match(regex);
        if (matches) {
          keywordCounts.set(keywordLower, (keywordCounts.get(keywordLower) || 0) + matches.length);
        }
      });
    });

    const keywords = Array.from(keywordCounts.entries())
      .filter(([_, count]) => count > 0)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count);

    setAvailableKeywords(keywords);
  }, []);

  // Calculate available sources from all loaded stories
  // When keyword filter is active, only count sources that have those keywords
  const updateAvailableSources = useCallback((stories: Story[], activeKeywords: string[]) => {
    // Filter stories by active keywords first if applicable
    const storiesToCount = activeKeywords.length > 0
      ? stories.filter(story => {
          const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
          return activeKeywords.some(keyword => text.includes(keyword.toLowerCase()));
        })
      : stories;

    const sourceCounts = new Map<string, { domain: string; count: number }>();
    
    storiesToCount.forEach(story => {
      if (story.article?.source_url) {
        try {
          const url = new URL(story.article.source_url);
          const domain = url.hostname.replace(/^www\./, '');
          const existing = sourceCounts.get(domain);
          if (existing) {
            existing.count++;
          } else {
            sourceCounts.set(domain, { domain, count: 1 });
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    const sources = Array.from(sourceCounts.entries())
      .map(([domain, { count }]) => ({
        source_name: domain.split('.')[0],
        source_domain: domain,
        count
      }))
      .sort((a, b) => b.count - a.count);

    setAvailableSources(sources);
  }, []);

  // PHASE 1: Load global filter options from entire database (with full fallback)
  const loadGlobalFilterOptions = useCallback(async (topicSlug: string) => {
    console.log('🔍 Phase 1: Attempting to load global filter options from database...');
    
    try {
      // Create abort controller for 5-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const { data, error } = await supabase
        .rpc('get_topic_filter_options', {
          p_topic_slug: topicSlug
        })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        console.warn('⚠️ Phase 1: RPC failed, will fallback to client-side filtering:', error);
        return false; // Signal failure, caller will use fallback
      }

      if (!data || data.length === 0) {
        console.log('📄 Phase 1: No filter options found in database');
        return false;
      }

      // Separate keywords and sources
      const keywordData = data.filter(item => item.filter_type === 'keyword');
      const sourceData = data.filter(item => item.filter_type === 'source');

      const globalKeywords: KeywordCount[] = keywordData.map(item => ({
        keyword: item.filter_value,
        count: Number(item.count)
      }));

      // Enrich source names using content_sources table for full names
      const domains = sourceData.map(item => item.filter_value);
      let domainToName: Record<string, string> = {};
      if (domains.length > 0) {
        const { data: srcRows, error: srcErr } = await supabase
          .from('content_sources')
          .select('canonical_domain, source_name')
          .in('canonical_domain', domains);
        if (!srcErr && srcRows) {
          srcRows.forEach((row: any) => {
            domainToName[row.canonical_domain] = row.source_name || row.canonical_domain;
          });
        }
      }

      const globalSources: SourceCount[] = sourceData.map(item => {
        const domain = item.filter_value;
        const name = domainToName[domain] || domain.replace(/^www\./, '').split('.')[0];
        const pretty = name.charAt(0).toUpperCase() + name.slice(1);
        return {
          source_name: pretty,
          source_domain: domain,
          count: Number(item.count)
        };
      });

      console.log('✅ Phase 1: Successfully loaded global filters', {
        keywords: globalKeywords.length,
        sources: globalSources.length
      });

      setAvailableKeywords(globalKeywords);
      setAvailableSources(globalSources);
      preferGlobalFiltersRef.current = true;
      
      return true; // Signal success
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('⚠️ Phase 1: RPC timed out after 5 seconds, using client-side fallback');
      } else {
        console.warn('⚠️ Phase 1: RPC error, using client-side fallback:', error);
      }
      return false; // Signal failure
    }
  }, []);

  // Client-side filtering for immediate feedback - now handles mixed content, keywords, and sources
  const applyClientSideFiltering = useCallback((content: FeedContent[], keywords: string[], sources: string[]) => {
    if (keywords.length === 0 && sources.length === 0) {
      // Ensure content is sorted when no filters too
      return [...content].sort((a, b) => new Date(b.content_date).getTime() - new Date(a.content_date).getTime());
    }

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
      // Parliamentary mentions are not filtered
      return keywords.length === 0 && sources.length === 0;
    });

    return filtered.sort((a, b) => new Date(b.content_date).getTime() - new Date(a.content_date).getTime());
  }, []);

  // Debounced server-side filtering with sources (Phase 2)
  const triggerServerFiltering = useCallback(async (keywords: string[], sources: string[]) => {
    if (!topic) return;

    setIsServerFiltering(true);
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
    }
  }, [topic, loadStories]);

  // Handle keyword selection with hybrid filtering (Phase 2: includes sources)
  const toggleKeyword = useCallback((keyword: string) => {
    setSelectedKeywords(prev => {
      const newKeywords = prev.includes(keyword)
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword];

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Apply immediate client-side filtering if we have server-filtered data
      if (serverFilteredRef.current || newKeywords.length === 0) {
        const baseContent = newKeywords.length === 0 ? allContent : filteredContent;
        setFilteredContent(applyClientSideFiltering(baseContent, newKeywords, selectedSources));
      } else {
        // Apply client-side filtering immediately for responsiveness
        setFilteredContent(applyClientSideFiltering(allContent, newKeywords, selectedSources));
      }

      // Debounce server-side filtering (PHASE 2: now includes sources)
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(newKeywords, selectedSources);
      }, DEBOUNCE_DELAY_MS);

      return newKeywords;
    });
  }, [allContent, filteredContent, selectedSources, applyClientSideFiltering, triggerServerFiltering]);

  // Handle source selection (Phase 2: with server-side filtering)
  const toggleSource = useCallback((sourceDomain: string) => {
    setSelectedSources(prev => {
      const newSources = prev.includes(sourceDomain)
        ? prev.filter(s => s !== sourceDomain)
        : [...prev, sourceDomain];

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Apply client-side filtering immediately for responsiveness
      setFilteredContent(applyClientSideFiltering(allContent, selectedKeywords, newSources));

      // PHASE 2: Debounce server-side filtering for sources too
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(selectedKeywords, newSources);
      }, DEBOUNCE_DELAY_MS);

      return newSources;
    });
  }, [allContent, selectedKeywords, applyClientSideFiltering, triggerServerFiltering]);

  const clearAllFilters = useCallback(() => {
    setSelectedKeywords([]);
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

  const loadMore = useCallback(async () => {
    if (!topic || loadingMore || !hasMore) return;
    
    const nextPage = page + 1;
    setPage(nextPage);
    
    // PHASE 2: Pass both keywords and sources when loading more filtered results
    const keywords = selectedKeywords.length > 0 && serverFilteredRef.current 
      ? selectedKeywords 
      : null;
    
    const sources = selectedSources.length > 0 && serverFilteredRef.current
      ? selectedSources
      : null;
      
    await loadStories(topic, nextPage, true, keywords, sources);
  }, [topic, loadingMore, hasMore, page, selectedKeywords, selectedSources, loadStories]);

  const refresh = useCallback(async () => {
    if (!topic) return;
    
    setPage(0);
    setHasMore(true);
    serverFilteredRef.current = false;
    
    // PHASE 2: Refresh with both filters
    const keywords = selectedKeywords.length > 0 ? selectedKeywords : null;
    const sources = selectedSources.length > 0 ? selectedSources : null;
    await loadStories(topic, 0, false, keywords, sources);
  }, [topic, selectedKeywords, selectedSources, loadStories]);

  // Initialize feed
  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('🚀 Initializing feed for slug:', slug);
        const topicData = await loadTopic();
        console.log('✅ Topic loaded:', topicData?.name);
        setPage(0);
        
        // PHASE 1: Try to load global filter options from database
        const globalFiltersLoaded = await loadGlobalFilterOptions(slug);
        
        if (!globalFiltersLoaded) {
          console.log('🔄 Phase 1: Falling back to client-side filter calculation');
          // Fallback is handled by the existing useEffect below (lines 638-645)
        }
        
        console.log('📚 Loading stories for topic:', topicData?.id);
        await loadStories(topicData, 0, false, null);
        console.log('✅ Stories loaded successfully');
      } catch (error) {
        console.error('Error initializing hybrid feed:', error);
        setLoading(false);
      }
    };

    if (slug) {
      initialize();
    }
  }, [slug, loadTopic, loadStories, loadGlobalFilterOptions]);

  // Update available keywords and sources when stories change
  // Pass active filters to calculations for combined filtering context
  useEffect(() => {
    if (filteredStories.length > 0) {
      // Do not override global DB-driven options if we have them
      if (!preferGlobalFiltersRef.current) {
        if (topic?.keywords) {
          updateAvailableKeywords(filteredStories, topic.keywords, selectedSources);
        }
        updateAvailableSources(filteredStories, selectedKeywords);
      }
    }
  }, [filteredStories, topic?.keywords, selectedKeywords, selectedSources, updateAvailableKeywords, updateAvailableSources]);

  // Real-time subscription for slide updates
  useEffect(() => {
    if (!topic) return;

    const channel = supabase
      .channel('slide-updates-hybrid')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stories',
          filter: `is_published=eq.true`
        },
        (payload) => {
          console.log('🔄 New published story detected:', payload);
          setTimeout(() => {
            refresh();
          }, 1000);
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
        (payload) => {
          console.log('🔄 Story published/updated in real-time:', payload);
          setTimeout(() => {
            refresh();
          }, 1000);
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
          setTimeout(() => {
            refresh();
          }, 1000);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, refresh]);

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
    content: filteredContent, // New: mixed content with chronological ordering
    topic,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
    
    // Keyword filtering
    selectedKeywords,
    availableKeywords,
    isModalOpen,
    setIsModalOpen,
    toggleKeyword,
    clearAllFilters,
    removeKeyword,
    hasActiveFilters: selectedKeywords.length > 0 || selectedSources.length > 0,
    isServerFiltering,
    
    // Source filtering
    selectedSources,
    availableSources,
    toggleSource,
    removeSource
  };
};