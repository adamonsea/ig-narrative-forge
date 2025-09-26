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

      // For public topics, we need to get keywords for filtering
      let topicKeywords: string[] = [];
      if (topicData.is_public) {
        const { data: fullTopicData, error: keywordError } = await supabase
          .from('topics')
          .select('keywords, landmarks, organizations')
          .eq('slug', slug)
          .eq('is_public', true)
          .single();
        
        if (!keywordError && fullTopicData) {
          topicKeywords = [
            ...(fullTopicData.keywords || []),
            ...(fullTopicData.landmarks || []),
            ...(fullTopicData.organizations || [])
          ];
        }
      }

      setTopic({
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword',
        keywords: topicKeywords,
        is_public: topicData.is_public,
        created_by: '' // Not exposed in safe function
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

      // Use the public feed function for consistent access
      const { data: storiesData, error } = await supabase
        .rpc('get_public_topic_feed', {
          topic_slug_param: slug,
          p_limit: STORIES_PER_PAGE,
          p_offset: from,
          p_sort_by: sortBy
        });

      // Handle RPC errors (like permission denied)
      if (error) {
        console.error('🚨 Public feed RPC error:', error);
        setLastError(error.message);
        
        if (error.message.includes('permission denied') || error.code === '42501') {
          toast({
            title: "Feed Access Issue",
            description: "Having trouble loading the public feed. Trying alternative access...",
            variant: "destructive",
          });
        }
      }

      if (error) {
        console.error('❌ Error fetching stories via RPC:', error);
        
        // Only use regional fallback if RPC completely failed AND no data was returned
        if (!storiesData && topicData?.topic_type === 'regional' && topicData?.region) {
          console.log('🔄 Feed: RPC failed completely, trying regional fallback for', topicData.region);
          try {
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
              return; // Only return after successful fallback
            }
          } catch (fallbackError) {
            console.error('❌ Regional fallback also failed:', fallbackError);
          }
        }
        
        // If RPC returned data despite error, continue processing it
        console.log('⚠️ RPC had error but may have returned data, continuing...');
      }

      if (!storiesData || storiesData.length === 0 || error) {
        console.log('📄 No stories found for topic via public RPC, or RPC failed');
        // If public RPC failed or topic is not public, try admin feed as fallback
        if (error || topicData?.is_public === false) {
          console.log('🔒 Trying admin topic feed for private topic', topicData.id);
          const { data: adminData, error: adminError } = await supabase
            .rpc('get_admin_topic_stories', { p_topic_id: topicData.id });
          if (adminError) {
            console.warn('⚠️ Admin topic feed RPC error:', adminError);
          }
          if (adminData && adminData.length > 0) {
            // Load slides for admin stories
            const adminStoryIds = adminData.map((s: any) => s.id);
            let slidesData: any[] = [];
            if (adminStoryIds.length > 0) {
              const { data: slides, error: slidesError } = await supabase
                .rpc('get_public_slides_for_stories', { p_story_ids: adminStoryIds });
              if (slidesError) {
                console.warn('⚠️ Failed to load slides for admin feed, trying direct query:', slidesError);
                const { data: fallbackSlides } = await supabase
                  .from('slides')
                  .select('*')
                  .in('story_id', adminStoryIds)
                  .order('slide_number', { ascending: true });
                slidesData = fallbackSlides || [];
              } else {
                slidesData = slides || [];
              }
            }
            const transformedStories = adminData.map((story: any) => {
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
                cover_illustration_prompt: undefined,
                slides: storySlides,
                article: {
                  source_url: '#',
                  published_at: story.created_at,
                  region: topicData.region || 'Unknown'
                }
              };
            });
            if (append) setStories(prev => [...prev, ...transformedStories]);
            else setStories(transformedStories);
            setHasMore(adminData.length === STORIES_PER_PAGE);
            return;
          }
        }
        if (!append) {
          setStories([]);
          // If there was an error and no stories, inform the user
          if (error && !lastError) {
            toast({
              title: "Feed Loading Issue",
              description: "Unable to load content right now. Please try again later.",
              variant: "destructive",
            });
          }
        }
        setHasMore(false);
        setLastError(error?.message || null);
        return;
      }

      console.log('📚 Found stories via RPC:', storiesData.length);

      // Deduplicate stories by ID and title to prevent duplicates
      const uniqueStoriesMap = new Map();
      storiesData.forEach((story: any) => {
        const key = `${story.id}-${story.title}`;
        if (!uniqueStoriesMap.has(key)) {
          uniqueStoriesMap.set(key, story);
        }
      });
      const deduplicatedStories = Array.from(uniqueStoriesMap.values());
      
      // Load slides for each story to complete the feed data
      const storyIds = deduplicatedStories.map((story: any) => story.id);
      
      let slidesData: any[] = [];
      if (storyIds.length > 0) {
        // Use the secure public slides function for anonymous users
        const { data: slides, error: slidesError } = await supabase
          .rpc('get_public_slides_for_stories', {
            p_story_ids: storyIds
          });
        
        if (slidesError) {
          console.warn('⚠️ Failed to load slides via RPC, trying direct query:', slidesError);
          
          // Fallback to direct query
          const { data: fallbackSlides, error: fallbackError } = await supabase
            .from('slides')
            .select('*')
            .in('story_id', storyIds)
            .order('slide_number', { ascending: true });
          
          if (fallbackError) {
            console.warn('⚠️ Failed to load slides:', fallbackError);
          } else {
            slidesData = fallbackSlides || [];
          }
        } else {
          slidesData = slides || [];
        }
      }

      // Transform RPC response with slides data
      const transformedStories = deduplicatedStories.map((story: any) => {
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
          title: story.title || story.article_title,
          author: story.article_author || 'Unknown',
          publication_name: 'eeZee News',
          created_at: story.created_at,
          updated_at: story.updated_at,
          cover_illustration_url: story.cover_illustration_url,
          cover_illustration_prompt: story.cover_illustration_prompt,
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
          // Debounced refresh to avoid excessive updates
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
    sortBy,
    setSortBy,
    loadMore,
    refresh
  };
};