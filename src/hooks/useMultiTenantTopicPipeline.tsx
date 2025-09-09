import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";

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
  article_title: string;
  article_url: string;
  status: string;
  created_at: string;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  slidetype?: string;
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
  url?: string;
  author?: string;
  word_count?: number;
  cover_illustration_url?: string;
  illustration_generated_at?: string;
  slidetype?: string;
  tone?: string;
  writing_style?: string;
  audience_expertise?: string;
  slides?: any[];
}

export interface MultiTenantStats {
  totalArticles: number;
  pendingArticles: number;
  processingQueue: number;
  readyStories: number;
}

export const useMultiTenantTopicPipeline = (selectedTopicId: string | null) => {
  const { toast } = useToast();
  const [articles, setArticles] = useState<MultiTenantArticle[]>([]);
  const [queueItems, setQueueItems] = useState<MultiTenantQueueItem[]>([]);
  const [stories, setStories] = useState<MultiTenantStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MultiTenantStats>({
    totalArticles: 0,
    pendingArticles: 0,
    processingQueue: 0,
    readyStories: 0
  });

  // Import multi-tenant actions
  const {
    processingArticle,
    deletingArticles,
    approveMultiTenantArticle,
    deleteMultiTenantArticle,
    deleteMultipleMultiTenantArticles,
    cancelMultiTenantQueueItem,
    approveMultiTenantStory,
    rejectMultiTenantStory
  } = useMultiTenantActions();

  const loadTopicContent = useCallback(async () => {
    if (!selectedTopicId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get multi-tenant articles using the new RPC function
      const articlesResult = await supabase.rpc('get_topic_articles_multi_tenant', {
        p_topic_id: selectedTopicId,
        p_limit: 100
      });

      if (articlesResult.error) {
        console.error('Error loading multi-tenant articles:', articlesResult.error);
        setArticles([]);
      } else {
        const articlesData = articlesResult.data?.map((item: any) => ({
          id: item.article_id,
          shared_content_id: item.shared_content_id,
          title: item.title,
          body: item.body,
          author: item.author,
          url: item.url,
          image_url: item.image_url,
          published_at: item.published_at,
          word_count: item.word_count || 0,
          processing_status: item.processing_status,
          regional_relevance_score: item.regional_relevance_score || 0,
          content_quality_score: item.content_quality_score || 0,
          keyword_matches: item.keyword_matches || [],
          created_at: item.created_at,
          updated_at: item.updated_at
        })) || [];
        setArticles(articlesData);
      }

      // Legacy queue items for compatibility
      const queueResult = await supabase
        .from('content_generation_queue')
        .select(`
          id,
          topic_article_id,
          shared_content_id,
          status,
          created_at,
          attempts,
          max_attempts,
          error_message,
          slidetype,
          tone,
          writing_style,
          shared_article_content!inner(title, url)
        `)
        .eq('topic_article_id', selectedTopicId)
        .order('created_at', { ascending: false });

      if (queueResult.error) {
        console.error('Error loading queue items:', queueResult.error);
        setQueueItems([]);
      } else {
        const queueItemsData = queueResult.data?.map((item: any) => ({
          id: item.id,
          topic_article_id: item.topic_article_id,
          shared_content_id: item.shared_content_id,
          title: item.shared_article_content?.title || 'Unknown Title',
          article_title: item.shared_article_content?.title || 'Unknown Title',
          article_url: item.shared_article_content?.url || '',
          status: item.status,
          created_at: item.created_at,
          attempts: item.attempts || 0,
          max_attempts: item.max_attempts || 3,
          error_message: item.error_message,
          slidetype: item.slidetype,
          tone: item.tone,
          writing_style: item.writing_style
        })) || [];
        setQueueItems(queueItemsData);
      }

      // Legacy stories for compatibility
      const storiesResult = await supabase
        .from('stories')
        .select(`
          id,
          topic_article_id,
          shared_content_id,
          title,
          status,
          created_at,
          updated_at,
          cover_illustration_url,
          illustration_generated_at,
          slides(*)
        `)
        .order('created_at', { ascending: false });

      if (storiesResult.error) {
        console.error('Error loading stories:', storiesResult.error);
        setStories([]);
      } else {
        const storiesData = storiesResult.data?.map((story: any) => ({
          id: story.id,
          topic_article_id: story.topic_article_id,
          shared_content_id: story.shared_content_id,
          title: story.title,
          status: story.status,
          created_at: story.created_at,
          updated_at: story.updated_at,
          cover_illustration_url: story.cover_illustration_url,
          illustration_generated_at: story.illustration_generated_at,
          slides: story.slides || [],
          // Additional properties for compatibility
          url: '',
          author: '',
          word_count: 0,
          slidetype: '',
          tone: '',
          writing_style: '',
          audience_expertise: ''
        })) || [];
        setStories(storiesData);
      }

      // Calculate stats
      const newStats = {
        totalArticles: articlesResult.data?.length || 0,
        pendingArticles: (articlesResult.data || []).filter((a: any) => a.processing_status === 'new').length,
        processingQueue: queueResult.data?.length || 0,
        readyStories: (storiesResult.data || []).filter((s: any) => s.status === 'ready').length
      };
      setStats(newStats);

    } catch (error) {
      console.error('Error loading topic content:', error);
      toast({
        title: "Error loading content",
        description: "Failed to load multi-tenant topic content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedTopicId, toast]);

  // Migration functions
  const testMigration = useCallback(async () => {
    if (!selectedTopicId) return null;

    const { data: legacyCount } = await supabase
      .from('articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', selectedTopicId);

    const { data: multiTenantCount } = await supabase
      .from('topic_articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', selectedTopicId);

    return {
      legacy: legacyCount?.length || 0,
      multiTenant: multiTenantCount?.length || 0
    };
  }, [selectedTopicId]);

  const migrateTopicArticles = useCallback(async () => {
    if (!selectedTopicId) return;

    try {
      const { data, error } = await supabase.rpc('migrate_articles_to_multi_tenant', {
        p_limit: 1000
      });

      if (error) throw error;

      toast({
        title: "Migration completed",
        description: `Successfully migrated ${data || 0} articles to multi-tenant system`,
      });

      await loadTopicContent();
    } catch (error) {
      console.error('Migration failed:', error);
      toast({
        title: "Migration failed",
        description: "Failed to migrate articles to multi-tenant system",
        variant: "destructive",
      });
    }
  }, [selectedTopicId, loadTopicContent, toast]);

  // Action handlers with proper callbacks
  const handleMultiTenantApprove = useCallback(async (
    articleId: string,
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive',
    tone: 'formal' | 'conversational' | 'engaging',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven'
  ) => {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;
    
    await approveMultiTenantArticle(article, slideType, tone, writingStyle);
    await loadTopicContent();
  }, [approveMultiTenantArticle, loadTopicContent, articles]);

  const handleMultiTenantDelete = useCallback(async (articleId: string, articleTitle: string) => {
    await deleteMultiTenantArticle(articleId, articleTitle);
    await loadTopicContent();
  }, [deleteMultiTenantArticle, loadTopicContent]);

  const handleMultiTenantBulkDelete = useCallback(async (articleIds: string[]) => {
    await deleteMultipleMultiTenantArticles(articleIds);
    await loadTopicContent();
  }, [deleteMultipleMultiTenantArticles, loadTopicContent]);

  const handleMultiTenantCancelQueue = useCallback(async (queueId: string) => {
    await cancelMultiTenantQueueItem(queueId);
    await loadTopicContent();
  }, [cancelMultiTenantQueueItem, loadTopicContent]);

  const handleMultiTenantApproveStory = useCallback(async (storyId: string) => {
    await approveMultiTenantStory(storyId);
    await loadTopicContent();
  }, [approveMultiTenantStory, loadTopicContent]);

  const handleMultiTenantRejectStory = useCallback(async (storyId: string) => {
    await rejectMultiTenantStory(storyId);
    await loadTopicContent();
  }, [rejectMultiTenantStory, loadTopicContent]);

  // Load content when topic changes
  useEffect(() => {
    if (selectedTopicId) {
      loadTopicContent();
    }
  }, [selectedTopicId, loadTopicContent]);

  // Real-time subscriptions
  useEffect(() => {
    if (!selectedTopicId) return;

    const channel = supabase
      .channel('multi-tenant-topic-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topic_articles'
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
    // Data
    articles,
    queueItems,
    stories,
    stats,
    
    // Loading states
    loading,
    
    // Functions
    loadTopicContent,
    testMigration,
    migrateTopicArticles,
    setArticles,
    setQueueItems,
    setStories,
    setStats,
    
    // Multi-tenant actions
    handleMultiTenantApprove,
    handleMultiTenantDelete,
    handleMultiTenantBulkDelete,
    handleMultiTenantCancelQueue,
    handleMultiTenantApproveStory,
    handleMultiTenantRejectStory,
    
    // Multi-tenant action states from useMultiTenantActions
    processingArticle,
    deletingArticles
  };
};