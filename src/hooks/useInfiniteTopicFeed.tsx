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
}

type SortOption = "newest" | "oldest";

const STORIES_PER_PAGE = 10;

export const useInfiniteTopicFeed = (slug: string) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [page, setPage] = useState(0);
  const { toast } = useToast();

  const loadTopic = useCallback(async () => {
    try {
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (topicError) {
        if (topicError.code === 'PGRST116') {
          throw new Error('Topic not found');
        }
        throw topicError;
      }

      setTopic({
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword'
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

      // Get topic ID first to use with RPC
      const { data: topicForRpc } = await supabase
        .from('topics')
        .select('id')
        .eq('slug', slug)
        .single();

      if (!topicForRpc) {
        throw new Error('Topic not found for RPC call');
      }

      // Use server-side RPC to fetch stories with proper filtering and pagination
      const { data: storiesData, error } = await supabase
        .rpc('get_topic_stories', {
          p_topic_id: topicForRpc.id,
          p_status: 'published',
          p_limit: STORIES_PER_PAGE,
          p_offset: from
        });

      if (error) {
        console.error('❌ Error fetching stories via RPC:', error);
        
        // Regional fallback for topics with no direct article matches
        if (topicData?.topic_type === 'regional' && topicData?.region) {
          console.log('🔄 Feed: Trying regional fallback for', topicData.region);
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('stories')
            .select(`
              id,
              title,
              author,
              publication_name,
              created_at,
              updated_at,
              cover_illustration_url,
              cover_illustration_prompt,
              slides!inner (
                id,
                slide_number,
                content,
                word_count,
                visuals (
                  image_url,
                  alt_text
                )
              ),
              articles!inner (
                source_url,
                published_at,
                region,
                topic_id
              )
            `)
            .eq('status', 'published')
            .ilike('articles.region', `%${topicData.region}%`)
            .order('created_at', { ascending: sortBy === 'oldest' })
            .range(from, from + STORIES_PER_PAGE - 1);
          
          if (!fallbackError && fallbackData) {
            const regionalTransformed = fallbackData.map((story: any) => ({
              id: story.id,
              title: story.title,
              author: story.author || 'Unknown',
              publication_name: story.publication_name || 'Unknown Publication',
              created_at: story.created_at,
              updated_at: story.updated_at,
              cover_illustration_url: story.cover_illustration_url,
              cover_illustration_prompt: story.cover_illustration_prompt,
              slides: (story.slides || [])
                .sort((a: any, b: any) => a.slide_number - b.slide_number)
                .map((slide: any) => ({
                  id: slide.id,
                  slide_number: slide.slide_number,
                  content: slide.content,
                  word_count: slide.word_count,
                  visual: slide.visuals && slide.visuals[0] ? {
                    image_url: slide.visuals[0].image_url,
                    alt_text: slide.visuals[0].alt_text || ''
                  } : undefined
                })),
              article: {
                source_url: story.articles?.source_url,
                published_at: story.articles?.published_at,
                region: story.articles?.region || topicData.region || 'Unknown'
              }
            }));

            if (append) {
              setStories(prev => [...prev, ...regionalTransformed]);
            } else {
              setStories(regionalTransformed);
            }
            setHasMore(fallbackData.length === STORIES_PER_PAGE);
          }
        }
        return;
      }

      if (!storiesData || storiesData.length === 0) {
        console.log('📄 No stories found for topic');
        if (!append) {
          setStories([]);
        }
        setHasMore(false);
        return;
      }

      console.log('📚 Found stories via RPC:', storiesData.length);

      // Transform RPC response to expected format
      const transformedStories = storiesData.map((story: any) => ({
        id: story.id,
        title: story.title || story.article_title,
        author: story.article_author || 'Unknown',
        publication_name: 'eeZee News',
        created_at: story.created_at,
        updated_at: story.updated_at,
        cover_illustration_url: null,
        cover_illustration_prompt: null,
        slides: [], // Slides will be loaded separately if needed
        article: {
          source_url: story.article_source_url || '#',
          published_at: story.article_published_at,
          region: topicData.region || 'Unknown'
        }
      }));

      if (append) {
        setStories(prev => [...prev, ...transformedStories]);
      } else {
        setStories(transformedStories);
      }
      
      setHasMore(storiesData.length === STORIES_PER_PAGE);
      
    } catch (error) {
      console.error('Error loading stories:', error);
      
      // Log error to error tickets system
      try {
        await supabase.functions.invoke('error-logger', {
          body: {
            ticketType: 'topic_feed_error',
            sourceInfo: { slug, topicId: topicData?.id },
            errorDetails: error instanceof Error ? error.message : "Failed to load topic feed",
            severity: 'medium',
            contextData: { slug, pageNum, append, userAgent: navigator.userAgent }
          }
        });
      } catch (logError) {
        console.error('Failed to log error:', logError);
      }
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load stories",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [slug, sortBy, toast]);

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
  }, [slug, sortBy, loadTopic, loadStories]);

  return {
    stories,
    topic,
    loading,
    loadingMore,
    hasMore,
    sortBy,
    setSortBy,
    loadMore,
    refresh
  };
};