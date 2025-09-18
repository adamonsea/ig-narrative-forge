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
      const to = from + STORIES_PER_PAGE - 1;

      // Run both legacy (articles-based) and multi-tenant (topic_articles-based) queries in parallel
      // We keep simple per-source pagination and merge client-side
      const ascending = sortBy === 'oldest';
      const legacyQuery = supabase
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
          slides (
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
        .eq('articles.topic_id', topicData.id)
        .order('created_at', { ascending })
        .range(from, to);

      const multiTenantQuery = supabase
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
          slides (
            id,
            slide_number,
            content,
            word_count,
            visuals (
              image_url,
              alt_text
            )
          ),
          topic_articles!inner (
            id,
            topic_id,
            shared_article_content:shared_article_content!inner (
              url,
              title,
              author,
              published_at,
              source_domain
            )
          )
        `)
        .eq('status', 'published')
        .eq('topic_articles.topic_id', topicData.id)
        .order('created_at', { ascending })
        .range(from, to);

      const [legacyRes, mtRes] = await Promise.all([legacyQuery, multiTenantQuery]);

      let legacyData = legacyRes.data || [];
      const legacyError = legacyRes.error;
      const mtData = mtRes.data || [];
      const mtError = mtRes.error;

      // If no legacy stories found by topic_id and this is a regional topic with a region, try region-based fallback
      if ((!legacyData || legacyData.length === 0) && topicData?.topic_type === 'regional' && topicData?.region) {
        const { data: legacyRegionData, error: legacyRegionError } = await supabase
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
            slides (
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
          .order('created_at', { ascending })
          .range(from, to);
        if (!legacyRegionError && legacyRegionData) legacyData = legacyRegionData;
      }

      if (legacyError) console.error('Legacy stories query error:', legacyError);
      if (mtError) console.error('Multi-tenant stories query error:', mtError);

      console.info('📊 Stories query results:', {
        legacy: legacyData?.length || 0,
        multiTenant: mtData?.length || 0,
        legacyError: legacyError || null,
        multiTenantError: mtError || null
      });

      const legacyTransformed = (legacyData || []).map((story: any) => ({
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

      const multiTenantTransformed = (mtData || []).map((story: any) => {
        const sac = story.topic_articles?.shared_article_content;
        return {
          id: story.id,
          title: story.title,
          author: story.author || sac?.author || 'Unknown',
          publication_name: story.publication_name || sac?.source_domain || 'Unknown Publication',
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
            source_url: sac?.url,
            published_at: sac?.published_at,
            region: topicData?.region || 'Unknown'
          }
        };
      });

      // Merge and de-dupe by story id
      const mergedMap = new Map<string, any>();
      [...legacyTransformed, ...multiTenantTransformed].forEach((s) => mergedMap.set(s.id, s));
      let merged = Array.from(mergedMap.values());

      // Sort
      merged.sort((a, b) => (
        ascending
          ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));

      // Append or replace
      if (append) {
        setStories(prev => {
          const dedup = new Map<string, any>();
          [...prev, ...merged].forEach((s) => dedup.set(s.id, s));
          return Array.from(dedup.values());
        });
      } else {
        setStories(merged);
      }

      // Heuristic for more pages: if either source returned a full page
      setHasMore((legacyData?.length === STORIES_PER_PAGE) || (mtData?.length === STORIES_PER_PAGE));
      
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