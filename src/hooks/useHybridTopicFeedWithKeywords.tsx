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
  
  // Refs for debouncing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serverFilteredRef = useRef(false);
  
  // Derived filtered stories for backward compatibility
  const filteredStories = filteredContent.filter(item => item.type === 'story').map(item => item.data as Story);

  const loadTopic = useCallback(async () => {
    try {
      const { data: topics, error: topicError } = await supabase
        .rpc('get_safe_public_topic_info');

      if (topicError) throw topicError;

      const topicData = topics?.find(t => t.slug === slug);
      if (!topicData) throw new Error('Topic not found');

      const { data: fullTopicData, error: keywordError } = await supabase
        .from('topics')
        .select('keywords, landmarks, organizations, branding_config')
        .eq('slug', slug)
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

      setTopic(topicObject);
      return topicObject;
    } catch (error) {
      console.error('Error loading topic:', error);
      throw error;
    }
  }, [slug]);

  const loadStories = useCallback(async (
    topicData: any, 
    pageNum: number = 0, 
    append: boolean = false,
    keywords: string[] | null = null
  ) => {
    try {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      const from = pageNum * STORIES_PER_PAGE;
      
      console.log('🔍 Hybrid Feed: Loading stories', { 
        topicId: topicData.id, 
        page: pageNum, 
        keywords: keywords?.length || 0 
      });

      const { data: storiesData, error } = await supabase
        .rpc('get_topic_stories_with_keywords', {
          p_topic_slug: slug,
          p_keywords: keywords,
          p_limit: STORIES_PER_PAGE,
          p_offset: from
        });

      if (error) {
        console.error('🚨 Hybrid feed error:', error);
        throw error;
      }

      if (!storiesData || storiesData.length === 0) {
        console.log('📄 No stories found');
        if (!append) {
          setAllStories([]);
          setAllContent([]);
          setFilteredContent([]);
        }
        setHasMore(false);
        return;
      }

      // Load slides for each story
      const storyIds = storiesData.map((story: any) => story.id);
      let slidesData: any[] = [];
      
      if (storyIds.length > 0) {
        const { data: slides, error: slidesError } = await supabase
          .rpc('get_public_slides_for_stories', {
            p_story_ids: storyIds
          });
        
        if (slidesError) {
          console.warn('⚠️ Failed to load slides via RPC:', slidesError);
          const { data: fallbackSlides } = await supabase
            .from('slides')
            .select('*')
            .in('story_id', storyIds)
            .order('slide_number', { ascending: true });
          slidesData = fallbackSlides || [];
        } else {
          slidesData = slides || [];
        }
      }

      // Fetch popularity data for all stories
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
      const transformedStories = storiesData.map((story: any) => {
        const storySlides = slidesData
          .filter((slide: any) => slide.story_id === story.id)
          .map((slide: any) => ({
            id: slide.id,
            slide_number: slide.slide_number,
            content: slide.content,
            word_count: slide.word_count || 0,
            visual: slide.visuals && slide.visuals[0] ? {
              image_url: slide.visuals[0].image_url,
              alt_text: slide.visuals[0].alt_text || ''
            } : undefined
          }));
          
        return {
          id: story.id,
          title: story.title,
          author: story.author || 'Unknown',
          publication_name: '',
          created_at: story.created_at,
          updated_at: story.updated_at,
          cover_illustration_url: story.cover_illustration_url,
          cover_illustration_prompt: story.cover_illustration_prompt,
          popularity_data: popularityMap.get(story.id),
          slides: storySlides,
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

      const mixedContent = [...storyContent, ...parliamentaryContent]
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
        // Merge new stories with existing mixed content and re-sort chronologically
        setAllContent(prev => {
          const merged = [...prev, ...storyContent];
          return merged.sort((a, b) => {
            const aTime = new Date(a.content_date).getTime();
            const bTime = new Date(b.content_date).getTime();
            return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
          });
        });
        if (!keywords || keywords.length === 0) {
          setFilteredContent(prev => {
            const merged = [...prev, ...storyContent];
            return merged.sort((a, b) => {
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
      
      setHasMore(storiesData.length === STORIES_PER_PAGE);
      
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
  const updateAvailableKeywords = useCallback((stories: Story[], topicKeywords: string[]) => {
    if (topicKeywords.length === 0) {
      setAvailableKeywords([]);
      return;
    }

    const keywordCounts = new Map<string, number>();
    
    topicKeywords.forEach(keyword => {
      keywordCounts.set(keyword.toLowerCase(), 0);
    });

    stories.forEach(story => {
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

  // Client-side filtering for immediate feedback - now handles mixed content and preserves chronology
  const applyClientSideFiltering = useCallback((content: FeedContent[], keywords: string[]) => {
    if (keywords.length === 0) {
      // Ensure content is sorted when no filters too
      return [...content].sort((a, b) => new Date(b.content_date).getTime() - new Date(a.content_date).getTime());
    }

    const filtered = content.filter(item => {
      if (item.type === 'story') {
        const story = item.data as Story;
        const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
        return keywords.some(keyword => text.includes(keyword.toLowerCase()));
      }
      // Parliamentary mentions are not keyword-filtered for now
      return false;
    });

    return filtered.sort((a, b) => new Date(b.content_date).getTime() - new Date(a.content_date).getTime());
  }, []);

  // Debounced server-side filtering
  const triggerServerFiltering = useCallback(async (keywords: string[]) => {
    if (!topic) return;

    setIsServerFiltering(true);
    setPage(0);
    setHasMore(true);
    serverFilteredRef.current = false;

    try {
      await loadStories(topic, 0, false, keywords.length > 0 ? keywords : null);
    } catch (error) {
      console.error('Server filtering failed:', error);
      setIsServerFiltering(false);
    }
  }, [topic, loadStories]);

  // Handle keyword selection with hybrid filtering
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
        setFilteredContent(applyClientSideFiltering(baseContent, newKeywords));
      } else {
        // Apply client-side filtering immediately for responsiveness
        setFilteredContent(applyClientSideFiltering(allContent, newKeywords));
      }

      // Debounce server-side filtering
      debounceRef.current = setTimeout(() => {
        triggerServerFiltering(newKeywords);
      }, DEBOUNCE_DELAY_MS);

      return newKeywords;
    });
  }, [allStories, filteredStories, applyClientSideFiltering, triggerServerFiltering]);

  const clearAllFilters = useCallback(() => {
    setSelectedKeywords([]);
    setFilteredContent(allContent);
    serverFilteredRef.current = false;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, [allContent]);

  const removeKeyword = useCallback((keyword: string) => {
    toggleKeyword(keyword); // This will remove it since it's already selected
  }, [toggleKeyword]);

  const loadMore = useCallback(async () => {
    if (!topic || loadingMore || !hasMore) return;
    
    const nextPage = page + 1;
    setPage(nextPage);
    
    const keywords = selectedKeywords.length > 0 && serverFilteredRef.current 
      ? selectedKeywords 
      : null;
      
    await loadStories(topic, nextPage, true, keywords);
  }, [topic, loadingMore, hasMore, page, selectedKeywords, loadStories]);

  const refresh = useCallback(async () => {
    if (!topic) return;
    
    setPage(0);
    setHasMore(true);
    serverFilteredRef.current = false;
    
    const keywords = selectedKeywords.length > 0 ? selectedKeywords : null;
    await loadStories(topic, 0, false, keywords);
  }, [topic, selectedKeywords, loadStories]);

  // Initialize feed
  useEffect(() => {
    const initialize = async () => {
      try {
        const topicData = await loadTopic();
        setPage(0);
        await loadStories(topicData, 0, false, null);
      } catch (error) {
        console.error('Error initializing hybrid feed:', error);
      }
    };

    if (slug) {
      initialize();
    }
  }, [slug, loadTopic, loadStories]);

  // Update available keywords when stories change
  useEffect(() => {
    if (filteredStories.length > 0 && topic?.keywords) {
      updateAvailableKeywords(filteredStories, topic.keywords);
    }
  }, [filteredStories, topic?.keywords, updateAvailableKeywords]);

  // Real-time subscription for slide updates
  useEffect(() => {
    if (!topic) return;

    const channel = supabase
      .channel('slide-updates-hybrid')
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
    hasActiveFilters: selectedKeywords.length > 0,
    isServerFiltering
  };
};