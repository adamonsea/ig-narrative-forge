import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Multi-tenant article interface
export interface MultiTenantArticle {
  id: string;
  shared_content_id: string;
  title: string;
  body?: string;
  author?: string;
  url: string;
  image_url?: string;
  published_at?: string;
  word_count: number;
  processing_status: string;
  regional_relevance_score: number;
  content_quality_score: number;
  keyword_matches?: string[];
  created_at: string;
  updated_at: string;
}

export interface MultiTenantQueueItem {
  id: string;
  topic_article_id: string;
  shared_content_id: string;
  title: string;
  status: string;
  created_at: string;
  slidetype: string;
  tone?: string;
  writing_style?: string;
}

export interface MultiTenantStory {
  id: string;
  topic_article_id: string;
  shared_content_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  slides?: any[];
}

export interface MultiTenantStats {
  totalArticles: number;
  pendingArticles: number;
  processedArticles: number;
  queueItems: number;
  readyStories: number;
  draftStories: number;
}

export const useMultiTenantTopicPipeline = (selectedTopicId: string | null) => {
  const [articles, setArticles] = useState<MultiTenantArticle[]>([]);
  const [queueItems, setQueueItems] = useState<MultiTenantQueueItem[]>([]);
  const [stories, setStories] = useState<MultiTenantStory[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<MultiTenantStats>({
    totalArticles: 0,
    pendingArticles: 0,
    processedArticles: 0,
    queueItems: 0,
    readyStories: 0,
    draftStories: 0
  });
  const { toast } = useToast();

  /**
   * Load topic content using new multi-tenant structure
   */
  const loadTopicContent = useCallback(async () => {
    if (!selectedTopicId) {
      setArticles([]);
      setQueueItems([]);
      setStories([]);
      return;
    }

    setLoading(true);
    
    try {
      console.log('Loading multi-tenant content for topic:', selectedTopicId);
      
      // Get articles using the new multi-tenant function
      const { data: articlesData, error: articlesError } = await supabase.rpc(
        'get_topic_articles_multi_tenant',
        {
          p_topic_id: selectedTopicId,
          p_status: null,
          p_limit: 200,
          p_offset: 0
        }
      );

      if (articlesError) {
        console.error('Error loading articles:', articlesError);
        toast({
          title: "Error loading articles",
          description: articlesError.message,
          variant: "destructive"
        });
        return;
      }

      const processedArticles = (articlesData || []).map((article: any) => ({
        id: article.id,
        shared_content_id: article.shared_content_id,
        title: article.title,
        body: article.body,
        author: article.author,
        url: article.url,
        image_url: article.image_url,
        published_at: article.published_at,
        word_count: article.word_count,
        processing_status: article.processing_status,
        regional_relevance_score: article.regional_relevance_score,
        content_quality_score: article.content_quality_score,
        keyword_matches: article.keyword_matches || [],
        created_at: article.created_at,
        updated_at: article.updated_at
      }));

      setArticles(processedArticles);

      // For now, fall back to legacy structures for queue and stories
      // TODO: Create multi-tenant versions of these
      const { data: queueData, error: queueError } = await supabase
        .from('content_generation_queue')
        .select(`
          id,
          article_id,
          status,
          slidetype,
          tone,
          writing_style,
          created_at,
          articles!inner(
            title,
            topic_id
          )
        `)
        .eq('articles.topic_id', selectedTopicId)
        .in('status', ['pending', 'processing', 'failed'])
        .order('created_at', { ascending: false });

      if (queueError) {
        console.error('Error loading queue:', queueError);
      } else {
        const processedQueue = (queueData || []).map((item: any) => ({
          id: item.id,
          topic_article_id: item.article_id, // Legacy mapping
          shared_content_id: null, // Will be populated when we migrate queue
          title: item.articles?.title || 'Unknown',
          status: item.status,
          created_at: item.created_at,
          slidetype: item.slidetype,
          tone: item.tone,
          writing_style: item.writing_style
        }));
        setQueueItems(processedQueue);
      }

      // Load stories (also legacy for now)
      const { data: storiesData, error: storiesError } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          status,
          created_at,
          updated_at,
          article_id,
          slides:slides(*)
        `)
        .eq('articles.topic_id', selectedTopicId)
        .order('created_at', { ascending: false });

      if (storiesError) {
        console.error('Error loading stories:', storiesError);
      } else {
        const processedStories = (storiesData || []).map((story: any) => ({
          id: story.id,
          topic_article_id: story.article_id, // Legacy mapping
          shared_content_id: null, // Will be populated when we migrate stories
          title: story.title,
          status: story.status,
          created_at: story.created_at,
          updated_at: story.updated_at,
          slides: story.slides || []
        }));
        setStories(processedStories);
      }

      // Calculate stats
      const newStats: MultiTenantStats = {
        totalArticles: processedArticles.length,
        pendingArticles: processedArticles.filter(a => a.processing_status === 'new').length,
        processedArticles: processedArticles.filter(a => a.processing_status === 'processed').length,
        queueItems: queueData?.length || 0,
        readyStories: storiesData?.filter((s: any) => s.status === 'ready').length || 0,
        draftStories: storiesData?.filter((s: any) => s.status === 'draft').length || 0
      };

      setStats(newStats);
      
      console.log('Multi-tenant content loaded:', {
        articles: processedArticles.length,
        queue: queueData?.length || 0,
        stories: storiesData?.length || 0,
        stats: newStats
      });

    } catch (error) {
      console.error('Error in loadTopicContent:', error);
      toast({
        title: "Error loading topic content",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [selectedTopicId, toast]);

  /**
   * Test migration by comparing old vs new structure
   */
  const testMigration = useCallback(async () => {
    if (!selectedTopicId) return null;

    try {
      // Get legacy articles
      const { data: legacyArticles } = await supabase
        .from('articles')
        .select('*')
        .eq('topic_id', selectedTopicId);

      // Get multi-tenant articles
      const { data: multiTenantArticles } = await supabase.rpc(
        'get_topic_articles_multi_tenant',
        {
          p_topic_id: selectedTopicId,
          p_status: null,
          p_limit: 1000,
          p_offset: 0
        }
      );

      return {
        legacy: legacyArticles?.length || 0,
        multiTenant: multiTenantArticles?.length || 0,
        match: (legacyArticles?.length || 0) === (multiTenantArticles?.length || 0)
      };
    } catch (error) {
      console.error('Migration test error:', error);
      return null;
    }
  }, [selectedTopicId]);

  /**
   * Migrate existing articles for this topic
   */
  const migrateTopicArticles = useCallback(async () => {
    if (!selectedTopicId) return;

    try {
      const { data, error } = await supabase.rpc('migrate_articles_to_multi_tenant', {
        p_limit: 1000
      });

      if (error) {
        throw error;
      }

      const result = data as any;
      toast({
        title: "Migration completed",
        description: `Migrated ${result?.migrated_count || 0} articles to multi-tenant structure`
      });

      // Reload content
      await loadTopicContent();
    } catch (error: any) {
      console.error('Migration error:', error);
      toast({
        title: "Migration failed",
        description: error.message,
        variant: "destructive"
      });
    }
  }, [selectedTopicId, loadTopicContent, toast]);

  // Load content when topic changes
  useEffect(() => {
    loadTopicContent();
  }, [loadTopicContent]);

  // Set up real-time subscriptions for new tables
  useEffect(() => {
    if (!selectedTopicId) return;

    console.log('Setting up multi-tenant real-time subscriptions');

    const channel = supabase
      .channel('multi-tenant-topic-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topic_articles',
          filter: `topic_id=eq.${selectedTopicId}`
        },
        () => {
          console.log('Topic articles changed, reloading...');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_article_content'
        },
        () => {
          console.log('Shared content changed, reloading...');
          loadTopicContent();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTopicId, loadTopicContent]);

  return {
    articles,
    queueItems,
    stories,
    loading,
    stats,
    loadTopicContent,
    testMigration,
    migrateTopicArticles,
    setArticles,
    setQueueItems,
    setStories,
    setStats
  };
};