import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  branding_config?: {
    logo_url?: string;
    subheader?: string;
    show_topic_name?: boolean;
  };
}

const STORIES_PER_PAGE = 10;

export const useInfiniteTopicFeedWithKeywords = (slug: string) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadTopic = useCallback(async () => {
    try {
      // Use the secure function to get public topic info
      const { data: topics, error: topicError } = await supabase
        .rpc('get_safe_public_topic_info');

      if (topicError) {
        throw topicError;
      }

      // Find the topic by slug
      const topicData = topics?.find(t => t.slug === slug);

      if (!topicData) {
        throw new Error('Topic not found');
      }

      // Get full topic data including branding config
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

      setTopic({
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword',
        keywords: topicKeywords,
        is_public: topicData.is_public,
        created_by: '', // Not exposed in safe function
        branding_config: brandingConfig as any
      });

      return topicData;
    } catch (error) {
      console.error('Error loading topic:', error);
      throw error;
    }
  }, [slug]);

  const loadStories = useCallback(async (
    topicData: any, 
    pageNum: number = 0, 
    append: boolean = false
  ) => {
    try {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      const from = pageNum * STORIES_PER_PAGE;
      
      console.log('🔍 Feed: Loading stories for topic', topicData.id, 'page', pageNum);

      // Use the new keyword-aware function
      const { data: storiesData, error } = await supabase
        .rpc('get_topic_stories_with_keywords', {
          p_topic_slug: slug,
          p_keywords: null,
          p_limit: STORIES_PER_PAGE,
          p_offset: from
        });

      if (error) {
        console.error('🚨 Keyword-filtered feed error:', error);
        setLastError(error.message);
        throw error;
      }

      if (!storiesData || storiesData.length === 0) {
        console.log('📄 No stories found for keyword filter');
        if (!append) {
          setStories([]);
        }
        setHasMore(false);
        return;
      }

      console.log('📚 Found stories with keyword filter:', storiesData.length);

      // Load slides for each story
      const storyIds = storiesData.map((story: any) => story.id);
      
      let slidesData: any[] = [];
      if (storyIds.length > 0) {
        const { data: slides, error: slidesError } = await supabase
          .rpc('get_public_slides_for_stories', {
            p_story_ids: storyIds
          });
        
        if (slidesError) {
          console.warn('⚠️ Failed to load slides via RPC, trying direct query:', slidesError);
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
      if (storyIds.length > 0 && topicData) {
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
          publication_name: 'eeZee News',
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

      if (append) {
        setStories(prev => [...prev, ...transformedStories]);
      } else {
        setStories(transformedStories);
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
    }
  }, [slug, toast]);

  const loadMore = useCallback(async () => {
    if (!topic || loadingMore || !hasMore) return;
    
    const nextPage = page + 1;
    setPage(nextPage);
    await loadStories(topic, nextPage, true);
  }, [topic, loadingMore, hasMore, page, loadStories]);

  const refresh = useCallback(async () => {
    if (!topic) return;
    
    setPage(0);
    setHasMore(true);
    await loadStories(topic, 0, false);
  }, [topic, loadStories]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const topicData = await loadTopic();
        setPage(0);
        await loadStories(topicData, 0, false);
      } catch (error) {
        console.error('Error initializing feed:', error);
      }
    };

    if (slug) {
      initialize();
    }
  }, [slug, loadTopic, loadStories]);


  // Real-time subscription for slide updates
  useEffect(() => {
    if (!topic) return;

    const channel = supabase
      .channel('slide-updates')
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, refresh]);

  return {
    stories,
    topic,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh
  };
};