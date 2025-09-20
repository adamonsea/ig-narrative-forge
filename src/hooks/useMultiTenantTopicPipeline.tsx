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
  article_type?: 'legacy' | 'multi_tenant';
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

      // Get both legacy and multi-tenant articles for this topic
      const [legacyArticlesResult, multiTenantArticlesResult] = await Promise.all([
        // Legacy articles
        supabase
          .from('articles')
          .select('*')
          .eq('topic_id', selectedTopicId)
          .eq('processing_status', 'new')
          .order('created_at', { ascending: false })
          .limit(50),
        
        // Multi-tenant articles using the RPC function
        supabase.rpc('get_topic_articles_multi_tenant', {
          p_topic_id: selectedTopicId,
          p_status: 'new',
          p_limit: 50
        })
      ]);

      if (legacyArticlesResult.error || multiTenantArticlesResult.error) {
        console.error('Error loading articles:', {
          legacy: legacyArticlesResult.error,
          multiTenant: multiTenantArticlesResult.error
        });
        toast({
          title: "Error loading articles",
          description: "Failed to load articles. Please try refreshing.",
          variant: "destructive",
        });
      }

      // Get story IDs to filter out articles that are already published
      const { data: publishedStoriesData } = await supabase
        .from('stories')
        .select('article_id, topic_article_id')
        .eq('status', 'published');
      
      const publishedLegacyIds = new Set();
      const publishedMultiTenantIds = new Set();
      publishedStoriesData?.forEach(story => {
        if (story.article_id) publishedLegacyIds.add(story.article_id);
        if (story.topic_article_id) publishedMultiTenantIds.add(story.topic_article_id);
      });

      // Get pending/processing queue items to hide approved articles
      const { data: queueItemsForFiltering } = await supabase
        .from('content_generation_queue')
        .select('article_id, topic_article_id')
        .in('status', ['pending', 'processing']);
      
      const queuedLegacyIds = new Set();
      const queuedMultiTenantIds = new Set();
      queueItemsForFiltering?.forEach(item => {
        if (item.article_id) queuedLegacyIds.add(item.article_id);
        if (item.topic_article_id) queuedMultiTenantIds.add(item.topic_article_id);
      });

      // Process legacy articles
      const legacyArticles = (legacyArticlesResult.data || [])
        .filter((article: any) => 
          !publishedLegacyIds.has(article.id) &&
          !queuedLegacyIds.has(article.id)
        )
        .map((article: any) => {
          const wordCount = article.word_count || 0;
          const isSnippet = wordCount > 0 && wordCount < 150;
          return {
            id: article.id,
            shared_content_id: null, // Legacy articles don't have shared content
            topic_id: selectedTopicId,
            source_id: article.source_id,
            regional_relevance_score: article.regional_relevance_score || 0,
            content_quality_score: article.content_quality_score || 0,
            import_metadata: article.import_metadata || {},
            originality_confidence: article.originality_confidence || 100,
            created_at: article.created_at,
            updated_at: article.updated_at,
            processing_status: article.processing_status,
            keyword_matches: article.keywords || [],
            url: article.source_url,
            normalized_url: article.canonical_url || article.source_url,
            title: article.title,
            body: article.body,
            author: article.author,
            image_url: article.image_url,
            canonical_url: article.canonical_url,
            content_checksum: article.content_checksum,
            published_at: article.published_at,
            word_count: wordCount,
            language: article.language || 'en',
            source_domain: article.source_url ? new URL(article.source_url).hostname : '',
            last_seen_at: article.updated_at,
            is_snippet: isSnippet,
            article_type: 'legacy' as const
          };
        });

      // Process multi-tenant articles
      const multiTenantArticles = (multiTenantArticlesResult.data || [])
        .filter((item: any) => 
          !publishedMultiTenantIds.has(item.id) &&
          !queuedMultiTenantIds.has(item.id)
        )
        .map((item: any) => {
          const wordCount = item.word_count || 0;
          const isSnippet = wordCount > 0 && wordCount < 150;
          return {
            id: item.id,
            shared_content_id: item.shared_content_id,
            topic_id: selectedTopicId,
            source_id: item.source_id,
            regional_relevance_score: item.regional_relevance_score || 0,
            content_quality_score: item.content_quality_score || 0,
            import_metadata: item.import_metadata || {},
            originality_confidence: item.originality_confidence || 100,
            created_at: item.created_at,
            updated_at: item.updated_at,
            processing_status: item.processing_status,
            keyword_matches: item.keyword_matches || [],
            url: item.url,
            normalized_url: item.normalized_url || item.url,
            title: item.title,
            body: item.body,
            author: item.author,
            image_url: item.image_url,
            canonical_url: item.canonical_url,
            content_checksum: item.content_checksum,
            published_at: item.published_at,
            word_count: wordCount,
            language: item.language || 'en',
            source_domain: item.source_domain,
            last_seen_at: item.last_seen_at || item.updated_at,
            is_snippet: isSnippet,
            article_type: 'multi_tenant' as const
          };
        });

      // Merge and sort all articles by creation date
      const allArticles = [...legacyArticles, ...multiTenantArticles].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log('🧪 Pipeline Debug - Articles Loaded:', {
        legacy: legacyArticles.length,
        multiTenant: multiTenantArticles.length,
        total: allArticles.length,
        publishedLegacy: publishedLegacyIds.size,
        publishedMultiTenant: publishedMultiTenantIds.size,
        queuedLegacy: queuedLegacyIds.size,
        queuedMultiTenant: queuedMultiTenantIds.size,
        selectedTopicId,
        articlesFiltered: {
          legacyExcluded: (legacyArticlesResult.data || []).length - legacyArticles.length,
          multiTenantExcluded: (multiTenantArticlesResult.data || []).length - multiTenantArticles.length
        }
      });

      if (allArticles.length === 0) {
        console.log('🔍 Empty Feed Analysis:', {
          legacyRawCount: legacyArticlesResult.data?.length || 0,
          multiTenantRawCount: multiTenantArticlesResult.data?.length || 0,
          publishedCount: publishedStoriesData?.length || 0,
          queuedCount: queueItemsForFiltering?.length || 0,
          message: 'All articles have been either published or are in processing queue'
        });
      }

      setArticles(allArticles);
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
      const allTopicArticleIds = new Set([
        ...(legacyArticlesResult.data || []).map((a: any) => a.id),
        ...(multiTenantArticlesResult.data || []).map((a: any) => a.id)
      ]);
      filteredQueueItems = (queueResult.data || []).filter((item: any) => 
        (item.article_id && allTopicArticleIds.has(item.article_id)) ||
        (item.topic_article_id && allTopicArticleIds.has(item.topic_article_id))
      );
        
        const queueItemsData = filteredQueueItems.map((item: any) => ({
          id: item.id,
          article_id: null,
          topic_article_id: item.topic_article_id,
          shared_content_id: item.shared_content_id,
          status: item.status,
          created_at: item.created_at,
          started_at: item.started_at,
          completed_at: item.completed_at,
          attempts: item.attempts || 0,
          max_attempts: item.max_attempts || 3,
          error_message: item.error_message,
          result_data: item.result_data || {},
          slidetype: item.slidetype || 'tabloid',
          tone: item.tone || 'conversational',
          audience_expertise: item.audience_expertise || 'intermediate',
          ai_provider: item.ai_provider || 'deepseek',
          writing_style: item.writing_style || 'journalistic',
          title: item.shared_article_content?.title || 'Unknown Title',
          article_title: item.shared_article_content?.title || 'Unknown Title',
          article_url: item.shared_article_content?.url || ''
        }));
        setQueueItems(queueItemsData);
      }

      console.log('🔄 Loading stories via server-side filters for topic:', selectedTopicId);
      
      const statuses = ['draft', 'ready', 'published'];
      
      // Fetch stories without large IN() lists by filtering via server-side joins
      const [legacyStoriesResult, multiTenantStoriesResult] = await Promise.all([
        // Legacy stories joined to articles filtered by topic_id
        supabase
          .from('stories')
          .select(`
            *,
            slides(*),
            article:articles!inner(
              id, topic_id, title, source_url, author, published_at
            )
          `)
          .in('status', statuses)
          .eq('articles.topic_id', selectedTopicId)
          .order('created_at', { ascending: false }),
        
        // Multi-tenant stories joined to topic_articles filtered by topic_id
        supabase
          .from('stories')
          .select(`
            *,
            slides(*),
            topic_article:topic_articles!inner(
              id, topic_id,
              shared_content:shared_article_content(title, url, author, published_at)
            )
          `)
          .in('status', statuses)
          .eq('topic_articles.topic_id', selectedTopicId)
          .order('created_at', { ascending: false })
      ]);

      console.log('📊 Stories query results (server-side filtered):', {
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
      
      const uniqueStories = allStories.filter((story, index, arr) => 
        arr.findIndex(s => s.id === story.id) === index
      );
      
      const sortedStories = uniqueStories.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log('✅ Stories loaded successfully:', sortedStories.length, 'total unique stories');

      // Map to MultiTenantStory shape
      const storiesData = sortedStories.map((story: any) => {
        const isLegacy = !!story.article_id;
        const articleData = isLegacy 
          ? story.article 
          : story.topic_article?.shared_content;
        return {
          id: story.id,
          article_id: story.article_id || null,
          topic_article_id: story.topic_article_id || null,
          headline: story.headline || story.title || articleData?.title || 'Untitled',
          summary: story.summary,
          status: story.status,
          is_published: Boolean(story.is_published) || story.status === 'published',
          created_at: story.created_at,
          updated_at: story.updated_at,
          slides: Array.isArray(story.slides) ? story.slides : [],
          article_title: articleData?.title || 'Untitled',
          story_type: isLegacy ? ('legacy' as const) : ('multi_tenant' as const),
          title: story.headline || story.title || articleData?.title,
          url: isLegacy ? (story.article?.source_url || '') : (story.topic_article?.shared_content?.url || ''),
          author: isLegacy ? (story.article?.author || '') : (story.topic_article?.shared_content?.author || ''),
          word_count: story.word_count || 0,
          cover_illustration_url: story.cover_illustration_url,
          illustration_generated_at: story.illustration_generated_at,
          slidetype: story.slidetype || '',
          tone: story.tone || '',
          writing_style: story.writing_style || '',
          audience_expertise: story.audience_expertise || '',
          is_teaser: story.is_teaser || false
        };
      });

      setStories(storiesData);
      
      // Calculate stats using the processed data
      setStats({
        articles: allArticles.length,
        queueItems: filteredQueueItems.length,
        stories: storiesData.length,
        totalArticles: allArticles.length,
        pendingArticles: allArticles.filter((a: any) => a.processing_status === 'new').length,
        processingQueue: filteredQueueItems.length,
        readyStories: storiesData.filter((s: any) => ['draft', 'ready'].includes(s.status)).length
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
    
    if (article.article_type === 'legacy') {
      // Handle legacy article approval
      const { error } = await supabase.rpc('approve_article_for_generation', {
        article_uuid: article.id
      });
      if (error) throw error;
    } else {
      // Handle multi-tenant article approval
      await approveMultiTenantArticle(article, finalSlideType, tone, writingStyle);
    }
    
    // Reload to update all sections and show the queue item
    await loadTopicContent();
  }, [approveMultiTenantArticle, loadTopicContent, supabase]);

  const handleMultiTenantDelete = useCallback(async (articleId: string, articleTitle: string) => {
    // Find the article to determine its type
    const article = articles.find(a => a.id === articleId);
    if (!article) return;

    if (article.article_type === 'legacy') {
      // Handle legacy article deletion
      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'discarded' })
        .eq('id', articleId);
      
      if (error) {
        console.error('Error deleting legacy article:', error);
        toast({
          title: "Error",
          description: "Failed to delete article",
          variant: "destructive"
        });
        return;
      }
    } else {
      // Handle multi-tenant article deletion
      await deleteMultiTenantArticle(articleId, articleTitle);
    }
    
    // Force immediate reload to show deletion
    await loadTopicContent();
  }, [articles, deleteMultiTenantArticle, loadTopicContent, toast, supabase]);

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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories'
        },
        () => {
          console.log('Stories changed, reloading...');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_generation_queue'
        },
        () => {
          console.log('Queue changed, reloading...');
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