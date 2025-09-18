import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";

export interface MultiTenantArticle {
  id: string;
  shared_content_id: string | null;
  topic_id: string;
  source_id: string | null;
  regional_relevance_score: number;
  content_quality_score: number;
  import_metadata: any;
  originality_confidence: number;
  created_at: string;
  updated_at: string;
  processing_status: string;
  keyword_matches: string[];
  url: string;
  normalized_url: string;
  title: string;
  body?: string;
  author?: string;
  image_url?: string;
  canonical_url?: string;
  content_checksum?: string;
  published_at?: string;
  word_count: number;
  language: string;
  source_domain?: string;
  last_seen_at: string;
  is_snippet?: boolean;
}

export interface MultiTenantQueueItem {
  id: string;
  article_id?: string | null;
  topic_article_id?: string | null;
  shared_content_id?: string | null;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  result_data: any;
  slidetype: string;
  tone: string;
  audience_expertise: string;
  ai_provider: string;
  writing_style: string;
  title?: string;
  article_title?: string;
  article_url?: string;
}

export interface MultiTenantStory {
  id: string;
  article_id?: string | null;
  topic_article_id?: string | null;
  headline: string;
  summary?: string;
  status: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  slides: any[];
  article_title: string;
  story_type: 'legacy' | 'multi_tenant';
  title?: string;
  url?: string;
  author?: string;
  word_count?: number;
  cover_illustration_url?: string;
  illustration_generated_at?: string;
  slidetype?: string;
  tone?: string;
  writing_style?: string;
  audience_expertise?: string;
  is_teaser?: boolean;
}

export interface MultiTenantStats {
  articles: number;
  queueItems: number;
  stories: number;
  totalArticles?: number;
  pendingArticles?: number;
  processingQueue?: number;
  readyStories?: number;
}

export const useMultiTenantTopicPipeline = (selectedTopicId: string | null) => {
  const { toast } = useToast();
  const [articles, setArticles] = useState<MultiTenantArticle[]>([]);
  const [queueItems, setQueueItems] = useState<MultiTenantQueueItem[]>([]);
  const [stories, setStories] = useState<MultiTenantStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MultiTenantStats>({
    articles: 0,
    queueItems: 0,
    stories: 0
  });

  // Import multi-tenant actions
  const {
    processingArticle,
    deletingArticles,
    animatingArticles, // New animation state
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
        toast({
          title: "Error loading articles",
          description: "Failed to load articles. Please try refreshing.",
          variant: "destructive",
        });
        setArticles([]);
      } else {
        // Log RPC result size for debugging
        console.info('🧪 MT pipeline: RPC articles returned', (articlesResult.data || []).length, 'for topic', selectedTopicId);

        // Get story IDs to filter out articles that are already published
        const publishedStoryIds = new Set();
        if (articlesResult.data) {
          const { data: storiesData } = await supabase
            .from('stories')
            .select('topic_article_id')
            .eq('status', 'published');
          storiesData?.forEach(story => {
            if (story.topic_article_id) publishedStoryIds.add(story.topic_article_id);
          });
        }

        // Get pending/processing queue items to hide approved articles
        const { data: queueItemsForFiltering } = await supabase
          .from('content_generation_queue')
          .select('topic_article_id')
          .in('status', ['pending', 'processing'])
          .not('topic_article_id', 'is', null);
        
        const queuedTopicArticleIds = new Set(
          (queueItemsForFiltering || []).map((item: any) => item.topic_article_id)
        );

        const articlesData = articlesResult.data
          ?.filter((item: any) => 
            item.processing_status === 'new' &&
            !publishedStoryIds.has(item.id) &&
            !queuedTopicArticleIds.has(item.id)
          )
          ?.map((item: any) => {
            const wordCount = item.word_count || 0;
            const isSnippet = wordCount > 0 && wordCount < 150;
            return {
              id: item.id,
              shared_content_id: item.shared_content_id,
              title: item.title,
              body: item.body,
              author: item.author,
              url: item.url,
              image_url: item.image_url,
              published_at: item.published_at,
              word_count: wordCount,
              processing_status: item.processing_status,
              regional_relevance_score: item.regional_relevance_score || 0,
              content_quality_score: item.content_quality_score || 0,
              keyword_matches: item.keyword_matches || [],
              created_at: item.created_at,
              updated_at: item.updated_at,
              is_snippet: isSnippet
            };
          }) || [];
        console.info('🧪 MT pipeline: filtered new articles', articlesData.length, { queued: queuedTopicArticleIds.size, publishedStories: publishedStoryIds.size });
        setArticles(articlesData);
      }
      // Declare variables for filtered data
      let filteredQueueItems: any[] = [];
      let filteredStories: any[] = [];

      // Get queue items for articles from this topic
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
        .not('topic_article_id', 'is', null)
        .order('created_at', { ascending: false });

      if (queueResult.error) {
        console.error('Error loading queue items:', queueResult.error);
        setQueueItems([]);
      } else {
        // Filter queue items to only include those from articles in this topic
        const topicArticleIds = new Set((articlesResult.data || []).map((a: any) => a.id));
        filteredQueueItems = (queueResult.data || []).filter((item: any) => 
          topicArticleIds.has(item.topic_article_id)
        );
        
        const queueItemsData = filteredQueueItems.map((item: any) => ({
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
        }));
        setQueueItems(queueItemsData);
      }

      console.log('🔄 Loading published stories for topic:', selectedTopicId);
      
      // ID-first strategy: Get article IDs for this topic, then get stories
      const [legacyArticlesRes, mtArticlesRes] = await Promise.all([
        // Get legacy article IDs for this topic
        supabase
          .from('articles')
          .select('id')
          .eq('topic_id', selectedTopicId),
        // Get multi-tenant article IDs for this topic  
        supabase
          .from('topic_articles')
          .select('id')
          .eq('topic_id', selectedTopicId)
      ]);

      const legacyArticleIds = (legacyArticlesRes.data || []).map(a => a.id);
      const mtTopicArticleIds = (mtArticlesRes.data || []).map(a => a.id);

      console.log('📊 Pipeline: Found article IDs', { 
        legacy: legacyArticleIds.length, 
        multiTenant: mtTopicArticleIds.length 
      });

      // Now get stories using these article IDs - fetch draft/ready/published for pipeline review
      const [legacyStoriesResult, multiTenantStoriesResult] = await Promise.all([
        // Query 1: Legacy stories using article IDs
        legacyArticleIds.length > 0 ? supabase
          .from('stories')
          .select(`
            *,
            slides!inner(*),
            article:articles!inner(title, source_url, region, topic_id)
          `)
          .in('status', ['draft', 'ready', 'published'])
          .in('article_id', legacyArticleIds)
          .order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        
        // Query 2: Multi-tenant stories using topic_article IDs
        mtTopicArticleIds.length > 0 ? supabase
          .from('stories')
          .select(`
            *,
            slides!inner(*),
            topic_article:topic_articles!inner(
              id, topic_id,
              shared_content:shared_article_content(title, url)
            )
          `)
          .in('status', ['draft', 'ready', 'published'])
          .in('topic_article_id', mtTopicArticleIds)
          .order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null })
      ]);

        console.log('📊 Stories query results:', {
          legacy: legacyStoriesResult.data?.length || 0,
          multiTenant: multiTenantStoriesResult.data?.length || 0,
          legacyError: legacyStoriesResult.error,
          multiTenantError: multiTenantStoriesResult.error
        });

        // Merge and deduplicate results
        const allStories = [
          ...(legacyStoriesResult.data || []),
          ...(multiTenantStoriesResult.data || [])
        ];
        
        // Remove duplicates by story ID
        const uniqueStories = allStories.filter((story, index, arr) => 
          arr.findIndex(s => s.id === story.id) === index
        );
        
        filteredStories = uniqueStories.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        
        console.log('✅ Stories loaded successfully:', filteredStories.length, 'total unique stories');

          // Map and set stories to keep UI consistent
          const storiesData = filteredStories.map((story: any) => {
            return {
              id: story.id,
              topic_article_id: story.topic_article_id,
              shared_content_id: story.shared_content_id,
              title: story.title,
              status: story.status,
              created_at: story.created_at,
              updated_at: story.updated_at,
              url: story.url || '',
              author: story.author || '',
              word_count: story.word_count || 0,
              cover_illustration_url: story.cover_illustration_url,
              illustration_generated_at: story.illustration_generated_at,
              slides: story.slides || [],
              slidetype: story.slidetype || '',
              tone: story.tone || '',
              writing_style: story.writing_style || '',
              audience_expertise: story.audience_expertise || '',
              is_teaser: story.is_teaser || false
            };
          });
          setStories(storiesData);
        
        setStats({
          articles: allArticles.length,
          queueItems: processedQueueItems.length,
          stories: allStories.length,
          totalArticles: allArticles.length,
          pendingArticles: allArticles.filter((a: any) => a.processing_status === 'new').length,
          processingQueue: processedQueueItems.length,
          readyStories: allStories.filter((s: any) => ['draft', 'ready'].includes(s.status)).length
        });

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
    article: MultiTenantArticle,
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive' = 'tabloid',
    tone: 'formal' | 'conversational' | 'engaging' = 'conversational',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven' = 'journalistic'
  ) => {
    // Auto-detect snippets and default to 'short' (3 slides) for better experience
    const finalSlideType = article.is_snippet && slideType === 'tabloid' ? 'short' : slideType;
    
    // Optimistically hide the article from Arrivals immediately
    setArticles(prev => prev.filter(a => a.id !== article.id));
    
    await approveMultiTenantArticle(article, finalSlideType, tone, writingStyle);
    // Reload to update all sections and show the queue item
    await loadTopicContent();
  }, [approveMultiTenantArticle, loadTopicContent]);

  const handleMultiTenantDelete = useCallback(async (articleId: string, articleTitle: string) => {
    await deleteMultiTenantArticle(articleId, articleTitle);
    // Force immediate reload to show deletion
    await loadTopicContent();
  }, [deleteMultiTenantArticle, loadTopicContent]);

  const handleMultiTenantBulkDelete = useCallback(async (articleIds: string[]) => {
    await deleteMultipleMultiTenantArticles(articleIds);
    // Force immediate reload to show bulk deletion
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

  const markArticleAsDiscarded = useCallback(async (articleId: string) => {
    if (!selectedTopicId) return;
    
    try {
      const { error } = await supabase
        .from('topic_articles')
        .update({ processing_status: 'discarded' })
        .eq('id', articleId);
      
      if (error) throw error;
      
      toast({
        title: "Article discarded",
        description: "Article has been marked as discarded",
      });
      await loadTopicContent();
    } catch (error) {
      console.error('Error marking article as discarded:', error);
      toast({
        title: "Error",
        description: "Failed to discard article",
        variant: "destructive",
      });
    }
  }, [selectedTopicId, loadTopicContent, toast]);

  const promoteTopicArticle = useCallback(async (topicArticleId: string) => {
    if (!selectedTopicId) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('promote-topic-article', {
        body: { topicArticleId }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast({
        title: "Article promoted",
        description: `Article "${data.title}" promoted to published queue`,
      });
      await loadTopicContent();
    } catch (error) {
      console.error('Error promoting article:', error);
      toast({
        title: "Promotion failed",
        description: "Failed to promote article to published queue",
        variant: "destructive",
      });
    }
  }, [selectedTopicId, loadTopicContent, toast]);

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
    markArticleAsDiscarded,
    promoteTopicArticle,
    
    // Multi-tenant action states from useMultiTenantActions
    processingArticle,
    deletingArticles,
    animatingArticles // New animation state
  };
};